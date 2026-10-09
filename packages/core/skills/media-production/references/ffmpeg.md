# FFmpeg delivery

Current stable release checked 2026-10-09: FFmpeg 9.0.2.
Read [download/release information](https://ffmpeg.org/download.html) and the
[filter documentation](https://ffmpeg.org/ffmpeg-filters.html).
Check installed build, encoders and filters before generating commands.

## Inspect first

~~~powershell
ffmpeg -version
ffprobe -v error -show_entries format=duration:stream=codec_type,codec_name,width,height,avg_frame_rate,sample_rate,channels -of json input.mp4
~~~

Separate container/codec choice, geometry, framerate and audio. Stream-copy is
appropriate only when no change requires re-encoding. Scaling/cropping/padding
requires video encoding; audio may still be copied if the output supports it.

## Fit without cropping

For a supported H.264 build and a 1080 by 1920 delivery:

~~~powershell
ffmpeg -n -i input.mp4 -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1" -c:v libx264 -crf 20 -pix_fmt yuv420p -c:a aac -movflags +faststart output.mp4
~~~

This preserves content with padding. Cropping and blurred backgrounds are
different creative decisions, not mandatory vertical-video behavior.
The -n option preserves existing output; overwrite only an owned disposable file.
Confirm codec/filter availability; do not assume hardware encoding improves
quality or elapsed time on every system.

## Timing and quality

- Match image-sequence input framerate to the renderer's timeline.
- Choose crop geometry and even dimensions required by the selected codec.
- Inspect color metadata/HDR requirements before conversion; avoid blindly
  treating HDR material as SDR.
- Use loudness analysis and destination targets; listen after normalizing.
- Validate subtitle timing, wrapping and fonts at actual delivery size.
- Check for final-frame truncation and audio drift after muxing.

Report metadata and actual playback inspection separately. Keep the master
until the delivery file is verified.
