//! Fixed workers avoid creating an OS thread for every renderer poll.
use crate::{err, Result};
use std::{
    net::TcpStream,
    sync::{
        mpsc::{sync_channel, SyncSender},
        Arc, Mutex,
    },
    thread,
};

const WORKERS: usize = 8;
const QUEUED: usize = 24;
pub struct RequestPool {
    sender: SyncSender<TcpStream>,
}
impl RequestPool {
    pub fn new(handler: impl Fn(TcpStream) + Send + Sync + 'static) -> Result<Self> {
        let (sender, receiver) = sync_channel::<TcpStream>(QUEUED);
        let receiver = Arc::new(Mutex::new(receiver));
        let handler = Arc::new(handler);
        for index in 0..WORKERS {
            let receiver = Arc::clone(&receiver);
            let handler = Arc::clone(&handler);
            thread::Builder::new()
                .name(format!("desktop-request-{index}"))
                .spawn(move || loop {
                    let next = match receiver.lock() {
                        Ok(receiver) => receiver.recv(),
                        Err(_) => return,
                    };
                    match next {
                        Ok(stream) => handler(stream),
                        Err(_) => return,
                    }
                })
                .map_err(err)?;
        }
        Ok(Self { sender })
    }
    pub fn submit(&self, stream: TcpStream) -> bool {
        self.sender.try_send(stream).is_ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        net::TcpListener,
        sync::{
            atomic::{AtomicUsize, Ordering},
            mpsc::channel,
            Condvar,
        },
        time::Duration,
    };
    #[test]
    fn bounds_running_and_queued_requests_and_drains_after_shutdown() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let client = TcpStream::connect(listener.local_addr().unwrap()).unwrap();
        let (stream, _) = listener.accept().unwrap();
        let gate = Arc::new((Mutex::new(false), Condvar::new()));
        let count = Arc::new(AtomicUsize::new(0));
        let peak = Arc::new(AtomicUsize::new(0));
        let (started_tx, started) = channel();
        let (done_tx, done) = channel();
        let (worker_gate, worker_count, worker_peak) =
            (Arc::clone(&gate), Arc::clone(&count), Arc::clone(&peak));
        let pool = RequestPool::new(move |_stream| {
            let active = worker_count.fetch_add(1, Ordering::SeqCst) + 1;
            worker_peak.fetch_max(active, Ordering::SeqCst);
            started_tx.send(()).unwrap();
            let (lock, signal) = &*worker_gate;
            let mut released = lock.lock().unwrap();
            while !*released {
                released = signal.wait(released).unwrap();
            }
            worker_count.fetch_sub(1, Ordering::SeqCst);
            done_tx.send(()).unwrap();
        })
        .unwrap();
        for _ in 0..WORKERS {
            assert!(pool.submit(stream.try_clone().unwrap()));
            started.recv_timeout(Duration::from_secs(3)).unwrap();
        }
        for _ in 0..QUEUED {
            assert!(pool.submit(stream.try_clone().unwrap()));
        }
        assert!(!pool.submit(stream.try_clone().unwrap()));
        assert_eq!(peak.load(Ordering::SeqCst), WORKERS);
        *gate.0.lock().unwrap() = true;
        gate.1.notify_all();
        drop(pool);
        for _ in 0..WORKERS + QUEUED {
            done.recv_timeout(Duration::from_secs(3)).unwrap();
        }
        assert_eq!(count.load(Ordering::SeqCst), 0);
        assert!(peak.load(Ordering::SeqCst) <= WORKERS);
        drop(client);
    }
}
