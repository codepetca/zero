import com.sun.source.tree.*;
import com.sun.source.util.*;
import javax.lang.model.element.*;
import javax.tools.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;

/** Maintainer attribution only: parse/analyze, never generate or invoke student code. */
class ApiInventory {
    static String field(String text) { return Base64.getEncoder().encodeToString(text.getBytes(StandardCharsets.UTF_8)); }
    static String hash(String text) throws Exception { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8))); }
    static boolean accessible(Element element) {
        for (Element owner = element.getEnclosingElement(); owner instanceof TypeElement; owner = owner.getEnclosingElement()) {
            if (!owner.getModifiers().contains(Modifier.PUBLIC) && !owner.getModifiers().contains(Modifier.PROTECTED)) return false;
        }
        return element.getModifiers().contains(Modifier.PUBLIC) || element.getModifiers().contains(Modifier.PROTECTED);
    }
    public static void main(String[] args) throws Exception {
        if (args.length < 3) throw new IllegalArgumentException("Expected classpath, source root and source files.");
        JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
        if (compiler == null) throw new IllegalStateException("A full JDK is required.");
        DiagnosticCollector<JavaFileObject> diagnostics = new DiagnosticCollector<>();
        try (StandardJavaFileManager manager = compiler.getStandardFileManager(diagnostics, Locale.ROOT, StandardCharsets.UTF_8)) {
            var paths = Arrays.stream(args).skip(2).map(Path::of).toList();
            JavacTask task = (JavacTask) compiler.getTask(null, manager, diagnostics,
                List.of("--release", "17", "-proc:none", "-classpath", args[0], "-implicit:none"), null, manager.getJavaFileObjectsFromPaths(paths));
            var units = new ArrayList<CompilationUnitTree>();
            task.parse().forEach(units::add);
            task.analyze();
            for (var diagnostic : diagnostics.getDiagnostics()) if (diagnostic.getKind() == Diagnostic.Kind.ERROR) throw new IllegalStateException(diagnostic.toString());
            Trees trees = Trees.instance(task);
            for (var unit : units) {
                String source = unit.getSourceFile().getCharContent(true).toString().replace("\r\n", "\n");
                // Input files are required to use LF so offsets identify the same bytes.
                String original = unit.getSourceFile().getCharContent(true).toString();
                if (!source.equals(original)) throw new IllegalStateException("Inventory input must use LF: " + unit.getSourceFile().getName());
                String relative = Path.of(args[1]).relativize(Path.of(unit.getSourceFile().toUri())).toString().replace('\\', '/');
                new TreePathScanner<Void, Void>() {
                    void emit(Tree tree, String kind) {
                        try {
                            Element element = trees.getElement(getCurrentPath());
                            if (element == null || !accessible(element)) return;
                            long start = trees.getSourcePositions().getStartPosition(unit, tree), end = trees.getSourcePositions().getEndPosition(unit, tree);
                            if (start < 0 || end <= start) return; // Generated default constructors/synthetic members have no source extent.
                            if (!(element.getEnclosingElement() instanceof TypeElement owner)) return;
                            String name = element.getSimpleName().toString(), signature, type;
                            if (element instanceof ExecutableElement executable) {
                                var parameters = new ArrayList<String>();
                                for (var parameter : executable.getParameters()) parameters.add(parameter.asType().toString());
                                if (executable.isVarArgs()) { int last = parameters.size() - 1; String array = parameters.get(last); parameters.set(last, array.substring(0, array.length() - 2) + "..."); }
                                signature = name + "(" + String.join(",", parameters) + ")";
                                type = executable.getReturnType().toString();
                            } else {type = element.asType().toString(); signature = name + ":" + type;}
                            String modifiers = String.join(",", element.getModifiers().stream().map(Object::toString).sorted().toList());
                            String[] values = {owner.getQualifiedName().toString(), signature, kind, name, type, modifiers, relative,
                                Long.toString(unit.getLineMap().getLineNumber(start)), Long.toString(start), Long.toString(end), hash(source.substring((int) start, (int) end))};
                            System.out.println(String.join("\t", Arrays.stream(values).map(ApiInventory::field).toList()));
                        } catch (Exception exception) {throw new IllegalStateException(exception);}
                    }
                    @Override public Void visitMethod(MethodTree node, Void unused) {emit(node, node.getReturnType() == null ? "constructor" : "method"); return super.visitMethod(node, unused);}
                    @Override public Void visitVariable(VariableTree node, Void unused) {
                        Element element = trees.getElement(getCurrentPath());
                        if (element != null && (element.getKind() == ElementKind.FIELD || element.getKind() == ElementKind.ENUM_CONSTANT)) emit(node, element.getKind() == ElementKind.ENUM_CONSTANT ? "enum-constant" : "field");
                        return super.visitVariable(node, unused);
                    }
                }.scan(unit, null);
            }
        }
    }
}
