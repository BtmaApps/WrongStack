/**
 * The out-of-process parser programs (Go's `go/ast`, Python's `ast`) and the
 * plumbing that runs them.
 *
 * The single-file parsers (`go-parser.ts`, `py-parser.ts`) and the batch
 * parsers (`parser-batch.ts`) used to embed two hand-maintained copies of each
 * program. The copies drifted: the Go batch reported 1-based columns while the
 * single-file script reported 0-based ones, so the same file indexed with
 * different positions depending on which path parsed it. Each language now has
 * ONE extraction core; the single-file and batch programs differ only in their
 * `main` (one source on stdin vs. a JSON array of sources).
 */

import { type ChildProcess, spawn } from 'node:child_process';
import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { recordParserSubprocess } from './perf-metrics.js';

// ─── Go ──────────────────────────────────────────────────────────────────────

const GO_CORE = `
package main

import (
	"encoding/json"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"io"
	"os"
	"strconv"
	"strings"
)

type Sym struct {
	Name      string \`json:"name"\`
	Kind      string \`json:"kind"\`
	Line      int    \`json:"line"\`
	Col       int    \`json:"col"\`
	Signature string \`json:"signature"\`
	Scope     string \`json:"scope"\`
	Doc       string \`json:"doc"\`
}

// Ref is a cross-reference emitted alongside the symbols, so one run yields
// both. Module is the import path for CallType "import", else empty.
type Ref struct {
	ToName   string \`json:"toName"\`
	CallType string \`json:"callType"\`
	Line     int    \`json:"line"\`
	Module   string \`json:"module"\`
}

func extract(src []byte) ([]Sym, []Ref, error) {
	fset := token.NewFileSet()
	node, err := parser.ParseFile(fset, "src.go", src, parser.ParseComments)
	if err != nil {
		return nil, nil, err
	}
	pkg := node.Name.Name
	// token columns are 1-based; the index schema's are 0-based.
	at := func(p token.Pos) (int, int) {
		pos := fset.Position(p)
		return pos.Line, pos.Column - 1
	}

	syms := []Sym{}
	for _, decl := range node.Decls {
		switch d := decl.(type) {
		case *ast.FuncDecl:
			line, col := at(d.Pos())
			kind := "function"
			scope := pkg + "." + d.Name.Name
			if d.Recv != nil && len(d.Recv.List) > 0 {
				kind = "method"
				scope = pkg + "." + recvTypeName(d.Recv.List[0].Type) + "." + d.Name.Name
			}
			syms = append(syms, Sym{Name: d.Name.Name, Kind: kind, Line: line, Col: col, Signature: formatFuncSig(d), Scope: scope, Doc: firstDocLine(d.Doc)})

		case *ast.GenDecl:
			// An ungrouped declaration carries its comment on the GenDecl; a
			// grouped one's doc describes the group, not each member.
			var declDoc *ast.CommentGroup
			if !d.Lparen.IsValid() {
				declDoc = d.Doc
			}
			for _, spec := range d.Specs {
				switch s := spec.(type) {
				case *ast.TypeSpec:
					line, col := at(s.Pos())
					sig := "type " + s.Name.Name + formatTypeParams(s.TypeParams)
					if s.Assign.IsValid() {
						sig += " ="
					}
					sig += " " + formatType(s.Type)
					syms = append(syms, Sym{Name: s.Name.Name, Kind: "type", Line: line, Col: col, Signature: sig, Scope: pkg, Doc: firstDocLine(s.Doc, declDoc)})
				case *ast.ValueSpec:
					kind := "var"
					if d.Tok == token.CONST {
						kind = "const"
					}
					for _, n := range s.Names {
						line, col := at(n.Pos())
						sig := kind + " " + n.Name
						if s.Type != nil {
							sig += " " + formatType(s.Type)
						}
						syms = append(syms, Sym{Name: n.Name, Kind: kind, Line: line, Col: col, Signature: sig, Scope: pkg, Doc: firstDocLine(s.Doc, declDoc)})
					}
				}
			}
		}
	}

	refs := []Ref{}
	ast.Inspect(node, func(n ast.Node) bool {
		switch expr := n.(type) {
		case *ast.CallExpr:
			line := fset.Position(expr.Pos()).Line
			switch fun := expr.Fun.(type) {
			case *ast.Ident:
				refs = append(refs, Ref{ToName: fun.Name, CallType: "call", Line: line})
			case *ast.SelectorExpr:
				// The selected name (\`Join\` of \`filepath.Join\`) is the declared
				// symbol name, so it resolves like the TS and Python call refs.
				refs = append(refs, Ref{ToName: fun.Sel.Name, CallType: "call", Line: line})
			}
		case *ast.ImportSpec:
			if expr.Path != nil {
				if importPath, uerr := strconv.Unquote(expr.Path.Value); uerr == nil {
					line := fset.Position(expr.Pos()).Line
					// A Go import names a package; its last path segment is the
					// name it is referenced by.
					name := importPath
					if idx := strings.LastIndex(importPath, "/"); idx >= 0 {
						name = importPath[idx+1:]
					}
					refs = append(refs, Ref{ToName: name, CallType: "import", Line: line, Module: importPath})
				}
			}
		}
		return true
	})
	return syms, refs, nil
}

func firstDocLine(groups ...*ast.CommentGroup) string {
	for _, g := range groups {
		if g == nil {
			continue
		}
		for _, line := range strings.Split(g.Text(), "\\n") {
			if t := strings.TrimSpace(line); t != "" {
				if r := []rune(t); len(r) > 200 {
					t = string(r[:200])
				}
				return t
			}
		}
	}
	return ""
}

// recvTypeName unwraps pointers, parens and generic instantiation:
// \`(l *List[T])\` is a method of List, not of "?".
func recvTypeName(t ast.Expr) string {
	switch v := t.(type) {
	case *ast.Ident:
		return v.Name
	case *ast.StarExpr:
		return recvTypeName(v.X)
	case *ast.ParenExpr:
		return recvTypeName(v.X)
	case *ast.IndexExpr:
		return recvTypeName(v.X)
	case *ast.IndexListExpr:
		return recvTypeName(v.X)
	default:
		return "?"
	}
}

func formatFuncSig(d *ast.FuncDecl) string {
	sig := "func "
	if d.Recv != nil && len(d.Recv.List) > 0 {
		sig += formatFieldList(d.Recv.List) + " "
	}
	return sig + d.Name.Name + formatTypeParams(d.Type.TypeParams) + formatFuncType(d.Type)
}

func fieldsOf(fl *ast.FieldList) []*ast.Field {
	if fl == nil {
		return nil
	}
	return fl.List
}

func formatFuncType(f *ast.FuncType) string {
	out := formatFieldList(fieldsOf(f.Params))
	results := fieldsOf(f.Results)
	if len(results) == 1 && len(results[0].Names) == 0 {
		out += " " + formatType(results[0].Type)
	} else if len(results) > 0 {
		out += " " + formatFieldList(results)
	}
	return out
}

// formatField keeps every name of a shared-type field: \`a, b int\`.
func formatField(f *ast.Field) string {
	t := formatType(f.Type)
	if len(f.Names) == 0 {
		return t
	}
	names := make([]string, len(f.Names))
	for i, n := range f.Names {
		names[i] = n.Name
	}
	return strings.Join(names, ", ") + " " + t
}

func formatFieldList(fields []*ast.Field) string {
	parts := make([]string, len(fields))
	for i, f := range fields {
		parts[i] = formatField(f)
	}
	return "(" + strings.Join(parts, ", ") + ")"
}

// formatFields renders struct fields and interface members.
func formatFields(fields []*ast.Field) string {
	parts := make([]string, len(fields))
	for i, f := range fields {
		if ft, ok := f.Type.(*ast.FuncType); ok && len(f.Names) == 1 {
			parts[i] = f.Names[0].Name + formatFuncType(ft)
		} else {
			parts[i] = formatField(f)
		}
	}
	return strings.Join(parts, "; ")
}

func formatTypeParams(tp *ast.FieldList) string {
	if tp == nil || len(tp.List) == 0 {
		return ""
	}
	parts := make([]string, len(tp.List))
	for i, p := range tp.List {
		parts[i] = formatField(p)
	}
	return "[" + strings.Join(parts, ", ") + "]"
}

func formatType(t ast.Expr) string {
	if t == nil {
		return "?"
	}
	switch v := t.(type) {
	case *ast.Ident:
		return v.Name
	case *ast.SelectorExpr:
		return formatType(v.X) + "." + v.Sel.Name
	case *ast.StarExpr:
		return "*" + formatType(v.X)
	case *ast.ParenExpr:
		return "(" + formatType(v.X) + ")"
	case *ast.Ellipsis:
		if v.Elt == nil {
			return "..."
		}
		return "..." + formatType(v.Elt)
	case *ast.ArrayType:
		if v.Len == nil {
			return "[]" + formatType(v.Elt)
		}
		return "[" + formatType(v.Len) + "]" + formatType(v.Elt)
	case *ast.MapType:
		return "map[" + formatType(v.Key) + "]" + formatType(v.Value)
	case *ast.ChanType:
		switch v.Dir {
		case ast.SEND:
			return "chan<- " + formatType(v.Value)
		case ast.RECV:
			return "<-chan " + formatType(v.Value)
		default:
			return "chan " + formatType(v.Value)
		}
	case *ast.InterfaceType:
		if len(fieldsOf(v.Methods)) == 0 {
			return "interface{}"
		}
		return "interface{ " + formatFields(v.Methods.List) + " }"
	case *ast.StructType:
		if len(fieldsOf(v.Fields)) == 0 {
			return "struct{}"
		}
		return "struct{ " + formatFields(v.Fields.List) + " }"
	case *ast.FuncType:
		return "func" + formatFuncType(v)
	case *ast.UnaryExpr:
		return v.Op.String() + formatType(v.X)
	case *ast.BinaryExpr:
		return formatType(v.X) + " " + v.Op.String() + " " + formatType(v.Y)
	case *ast.BasicLit:
		return v.Value
	case *ast.IndexExpr:
		return formatType(v.X) + "[" + formatType(v.Index) + "]"
	case *ast.IndexListExpr:
		args := make([]string, len(v.Indices))
		for i, idx := range v.Indices {
			args[i] = formatType(idx)
		}
		return formatType(v.X) + "[" + strings.Join(args, ", ") + "]"
	default:
		return "?"
	}
}
`;

/** One Go source on stdin → `{"symbols": [...], "refs": [...]}`. */
export const GO_PARSE_SCRIPT = `${GO_CORE}
type Result struct {
	Symbols []Sym \`json:"symbols"\`
	Refs    []Ref \`json:"refs"\`
}

func main() {
	empty := \`{"symbols":[],"refs":[]}\`
	src, err := io.ReadAll(os.Stdin)
	if err != nil {
		fmt.Print(empty)
		return
	}
	syms, refs, err := extract(src)
	if err != nil {
		fmt.Print(empty)
		return
	}
	data, err := json.Marshal(Result{Symbols: syms, Refs: refs})
	if err != nil {
		fmt.Print(empty)
		return
	}
	fmt.Print(string(data))
}
`;

/** A JSON array of `{file, content}` on stdin → one envelope with per-file results. */
export const GO_BATCH_SCRIPT = `${GO_CORE}
type FileResult struct {
	File    string \`json:"file"\`
	Error   string \`json:"error,omitempty"\`
	Symbols []Sym  \`json:"symbols"\`
	Refs    []Ref  \`json:"refs"\`
}

type BatchResult struct {
	Version int          \`json:"version"\`
	Results []FileResult \`json:"results"\`
}

type inputFile struct {
	File    string \`json:"file"\`
	Content string \`json:"content"\`
}

func main() {
	var inputs []inputFile
	raw, err := io.ReadAll(os.Stdin)
	if err == nil {
		err = json.Unmarshal(raw, &inputs)
	}
	results := make([]FileResult, 0, len(inputs))
	if err == nil {
		for _, in := range inputs {
			res := FileResult{File: in.File, Symbols: []Sym{}, Refs: []Ref{}}
			if syms, refs, perr := extract([]byte(in.Content)); perr != nil {
				res.Error = perr.Error()
			} else {
				res.Symbols, res.Refs = syms, refs
			}
			results = append(results, res)
		}
	}
	data, merr := json.Marshal(BatchResult{Version: 1, Results: results})
	if merr != nil {
		fmt.Print(\`{"version":1,"results":[]}\`)
		return
	}
	fmt.Print(string(data))
}
`;

// ─── Python ──────────────────────────────────────────────────────────────────

const PY_CORE = `import ast, json, sys

# Decorators whose function is an attribute accessor, by last dotted segment.
PROPERTY_DECORATORS = ("property", "cached_property", "abstractproperty", "setter", "getter", "deleter")

def get_name(node):
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return get_name(node.value) + "." + node.attr
    if isinstance(node, ast.Subscript):
        return get_name(node.value)
    if isinstance(node, ast.Call):
        return get_name(node.func)
    if isinstance(node, ast.Constant):
        return str(node.value)
    return ""

def leaf_name(node):
    # Declared name of the callee: \`join\` of \`os.path.join\`. Matches how the
    # TypeScript and Go extractors record call refs.
    if isinstance(node, ast.Attribute):
        return node.attr
    if isinstance(node, ast.Name):
        return node.id
    return get_name(node).split(".")[-1]

def is_private(name):
    return name.startswith("__") and not name.endswith("__")

def first_doc_line(node):
    try:
        doc = ast.get_docstring(node)
    except Exception:
        return ""
    for line in (doc or "").splitlines():
        line = line.strip()
        if line:
            return line[:200]
    return ""

def module_name_of(path):
    base = path.replace("\\\\", "/").rsplit("/", 1)[-1]
    return base.rsplit(".", 1)[0] if "." in base else base

def read_stdin_text():
    # Decode explicitly: sys.stdin uses the locale code page on Windows
    # (cp1254, cp1252, ...), which mangles or rejects the UTF-8 we are sent.
    return sys.stdin.buffer.read().decode("utf-8", "replace")

def parse_source(text, name):
    # ast.parse rejects a leading U+FEFF in a str source.
    if text.startswith("\\ufeff"):
        text = text[1:]
    return ast.parse(text, filename=name or "<module>")

def format_args(args):
    parts = [a.arg for a in list(getattr(args, "posonlyargs", [])) + list(args.args)]
    if args.vararg is not None:
        parts.append("*" + args.vararg.arg)
    elif args.kwonlyargs:
        parts.append("*")
    parts.extend(a.arg for a in args.kwonlyargs)
    if args.kwarg is not None:
        parts.append("**" + args.kwarg.arg)
    return ", ".join(parts)

def extract(tree, module_name):
    syms = []
    refs = []
    scope = [module_name]

    def add(name, kind, line, col, signature, sym_scope, doc=""):
        syms.append({
            "name": name, "kind": kind, "line": line, "col": col,
            "signature": signature, "scope": sym_scope, "doc": doc,
        })

    def qualified(name):
        return ".".join(scope) + "." + name

    # Kinds are the index schema's (class/function/method/property/var/const/
    # type). Imports are refs, not symbols: an import symbol per file made
    # every imported name look like a definition in every importing module.
    class Visitor(ast.NodeVisitor):
        in_class = False

        def visit_ClassDef(self, node):
            bases = [get_name(b) for b in node.bases]
            sig = "class " + node.name + ("(" + ", ".join(bases) + ")" if bases else "") + ": ..."
            add(node.name, "class", node.lineno, node.col_offset, sig, qualified(node.name), first_doc_line(node))
            scope.append(node.name)
            outer = self.in_class
            self.in_class = True
            try:
                self.generic_visit(node)
            finally:
                self.in_class = outer
                scope.pop()

        def visit_FunctionDef(self, node):
            kind = "method" if self.in_class else "function"
            for dec in node.decorator_list:
                if get_name(dec).rsplit(".", 1)[-1] in PROPERTY_DECORATORS:
                    kind = "property"
            prefix = "async def " if isinstance(node, ast.AsyncFunctionDef) else "def "
            sig = prefix + node.name + "(" + format_args(node.args) + ")"
            returns = get_name(node.returns) if node.returns is not None else ""
            if returns:
                sig += " -> " + returns
            add(node.name, kind, node.lineno, node.col_offset, sig, qualified(node.name), first_doc_line(node))
            # Bodies are not visited: function locals are not index symbols.

        visit_AsyncFunctionDef = visit_FunctionDef

        def add_target(self, target, line, annotation=None, has_value=True):
            if isinstance(target, ast.Name):
                if is_private(target.id):
                    return
                kind = "const" if target.id.isupper() else "var"
                if annotation is not None:
                    sig = target.id + ": " + get_name(annotation) + (" = ..." if has_value else "")
                else:
                    sig = target.id + " = ..."
                add(target.id, kind, line, target.col_offset, sig, ".".join(scope))
            elif isinstance(target, (ast.Tuple, ast.List)):
                for elt in target.elts:
                    self.add_target(elt, line)
            elif isinstance(target, ast.Starred):
                self.add_target(target.value, line)

        def visit_Assign(self, node):
            for target in node.targets:
                self.add_target(target, node.lineno)

        def visit_AnnAssign(self, node):
            self.add_target(node.target, node.lineno, node.annotation, node.value is not None)

        def visit_TypeAlias(self, node):
            if isinstance(node.name, ast.Name):
                add(node.name.id, "type", node.lineno, node.col_offset, "type " + node.name.id + " = ...", ".".join(scope))

    Visitor().visit(tree)

    # Refs need a full walk: the visitor deliberately skips function bodies,
    # which is exactly where the calls are.
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            name = leaf_name(node.func)
            if name:
                refs.append({"toName": name, "callType": "call", "line": node.lineno})
        elif isinstance(node, ast.Import):
            for alias in node.names:
                refs.append({
                    "toName": alias.name.split(".")[-1], "callType": "import",
                    "line": node.lineno, "module": alias.name,
                })
        elif isinstance(node, ast.ImportFrom):
            # PEP 328: keep the leading dots so the resolver can walk up from
            # the importing file's package.
            module = ("." * (node.level or 0)) + (node.module or "")
            for alias in node.names:
                refs.append({
                    "toName": alias.name, "callType": "import",
                    "line": node.lineno, "module": module,
                })
        elif isinstance(node, ast.ClassDef):
            for base in node.bases:
                name = leaf_name(base)
                if name:
                    refs.append({"toName": name, "callType": "inherit", "line": node.lineno})

    return syms, refs
`;

/** One Python source on stdin (file path in argv[1]) → `{"symbols", "refs"}`. */
export const PY_PARSE_SCRIPT = `${PY_CORE}
def main():
    name = sys.argv[1] if len(sys.argv) > 1 else "module.py"
    try:
        syms, refs = extract(parse_source(read_stdin_text(), name), module_name_of(name))
    except Exception:
        syms, refs = [], []
    print(json.dumps({"symbols": syms, "refs": refs}))

main()
`;

/** A JSON array of `{file, content}` on stdin → one envelope with per-file results. */
export const PY_BATCH_SCRIPT = `${PY_CORE}
def main():
    try:
        inputs = json.loads(read_stdin_text())
    except Exception:
        print(json.dumps({"version": 1, "results": []}))
        return
    results = []
    for entry in inputs:
        name = entry.get("file", "")
        result = {"file": name, "symbols": [], "refs": []}
        try:
            syms, refs = extract(parse_source(entry.get("content", ""), name), module_name_of(name))
            result["symbols"] = syms
            result["refs"] = refs
        except Exception as e:
            result["error"] = str(e) or type(e).__name__
        results.append(result)
    print(json.dumps({"version": 1, "results": results}))

main()
`;

// ─── Script files ────────────────────────────────────────────────────────────

const scriptPaths = new Map<string, Promise<string>>();

/**
 * Path of `script` written to a PRIVATE, UNPREDICTABLE directory, written once
 * per process.
 *
 * Security: a fixed location such as `os.tmpdir()/ws-py-parse/parse.py` can be
 * pre-created by another local user, who then either symlinks the script path
 * (our write follows the link) or leaves their own `ast.py`/`json.py` next to
 * it — Python puts the script's directory first on `sys.path`, so indexing
 * would run their module. `fs.mkdtemp` creates the directory with a random
 * suffix (0700 on POSIX) and `wx` refuses to write through anything already at
 * the path. The in-flight promise is cached so concurrent first calls share
 * one directory instead of racing to create several.
 */
export function privateScriptPath(
  prefix: string,
  fileName: string,
  script: string,
): Promise<string> {
  const key = `${prefix}\0${fileName}`;
  const cached = scriptPaths.get(key);
  if (cached) return cached;
  const pending = writePrivateScript(prefix, fileName, script);
  scriptPaths.set(key, pending);
  pending.catch(() => {
    if (scriptPaths.get(key) === pending) scriptPaths.delete(key);
  });
  return pending;
}

async function writePrivateScript(
  prefix: string,
  fileName: string,
  script: string,
): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const scriptPath = path.join(dir, fileName);
  await fs.writeFile(scriptPath, script, { encoding: 'utf8', flag: 'wx' });
  // Best-effort cleanup; a SIGKILL leaves the directory to the OS temp sweep.
  process.once('exit', () => {
    try {
      fsSync.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best-effort cleanup */
    }
  });
  return scriptPath;
}

/** Test-only: every script path written so far (failed writes resolve to ''). */
export function __privateScriptPathsForTest(): Promise<string[]> {
  return Promise.all([...scriptPaths.values()].map((p) => p.catch(() => '')));
}

// ─── Child processes ─────────────────────────────────────────────────────────

interface ToolchainSpawnOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
}

/**
 * Run `go run` from the script's own directory, never the indexed project.
 *
 * Launched from the project, the go command reads the project's `go.mod` and
 * `go.work`: a `go`/`toolchain` line newer than the installed Go made every
 * parse fail ("requires go >= …"), dropping the whole repository to the regex
 * fallback — or, with the default `GOTOOLCHAIN=auto`, made indexing download
 * and run whatever toolchain the scanned repository named. The parser only
 * needs the standard library, so it runs outside any module on the local
 * toolchain.
 */
export function goSpawnOptions(scriptPath: string): ToolchainSpawnOptions {
  return {
    cwd: path.dirname(scriptPath),
    env: { ...process.env, GOTOOLCHAIN: 'local', GOWORK: 'off' },
  };
}

/** Python runs from the script directory too, so the project is never on its path. */
export function pySpawnOptions(scriptPath: string): ToolchainSpawnOptions {
  return { cwd: path.dirname(scriptPath) };
}

/**
 * Spawn a parser child, feed `stdinPayload`, collect stdout.
 * Resolves `null` on spawn failure or timeout; never rejects.
 */
export function runToolchainChild(
  binary: string,
  args: string[],
  stdinPayload: string,
  timeoutMs: number,
  options: ToolchainSpawnOptions,
): Promise<{ code: number | null; stdout: string } | null> {
  return new Promise((resolve) => {
    let settled = false;
    let stdout = '';
    let proc: ChildProcess;
    try {
      recordParserSubprocess();
      proc = spawn(binary, args, {
        cwd: options.cwd,
        env: options.env ?? process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch {
      resolve(null);
      return;
    }
    const finish = (value: { code: number | null; stdout: string } | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      finish(null);
    }, timeoutMs);
    timer.unref?.();
    proc.on('error', () => finish(null));
    // Decoder, not `chunk.toString()`: the payload is parsed as JSON, so a
    // multi-byte character split across a pipe chunk boundary would corrupt it.
    const stdoutDecoder = new StringDecoder('utf8');
    proc.stdout?.on('data', (chunk: Buffer) => {
      stdout += stdoutDecoder.write(chunk);
    });
    // Drain stderr so toolchain diagnostics cannot fill the pipe and stall.
    proc.stderr?.resume();
    // A child that exits before reading all of stdin emits EPIPE on this
    // stream; without a listener that 'error' event is unhandled and takes
    // the whole indexer process down. The close handler still resolves.
    proc.stdin?.on('error', () => {
      /* EPIPE racing close */
    });
    proc.stdin?.write(stdinPayload);
    proc.stdin?.end();
    proc.on('close', (code) => {
      // Flush a partial trailing sequence before the JSON payload is parsed.
      stdout += stdoutDecoder.end();
      finish({ code, stdout });
    });
  });
}
