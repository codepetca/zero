package hub.policy;
import java.nio.file.*;
import java.util.*;
import javax.tools.*;
import com.sun.source.tree.*;
import com.sun.source.util.JavacTask;
import javax.lang.model.element.Modifier;
/** Parse-only source boundary; never loads candidate classes or annotation processors. */
public final class Boundary {
  public static void main(String[] args) throws Exception {
    String namespace = args[0];
    JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
    try (StandardJavaFileManager files = compiler.getStandardFileManager(null, null, null)) {
      var units = files.getJavaFileObjectsFromStrings(Arrays.asList(args).subList(1, args.length));
      var task = (JavacTask) compiler.getTask(null, files, null, List.of("-proc:none", "--release", "17"), null, units);
      for (CompilationUnitTree unit : task.parse()) {
        Path path = Path.of(unit.getSourceFile().toUri());
        String expected = path.getFileName().toString().replace(".java", "");
        boolean current = path.toString().contains("/src/main/java/") || path.toString().contains("/src/test/java/") || path.toString().contains("/examples/");
        boolean library = path.toString().contains("/src/main/java/") || (!current && path.toString().contains("/src/"));
        String pkg = unit.getPackageName() == null ? "" : unit.getPackageName().toString();
        if (current) {
          String marker = library ? "/src/main/java/" : path.toString().contains("/src/test/java/") ? "/src/test/java/"
              : path.toString().contains("/examples/first/") ? "/examples/first/" : "/examples/second/";
          String relative = path.toString().substring(path.toString().indexOf(marker) + marker.length());
          String expectedPackage = relative.contains("/") ? relative.substring(0, relative.lastIndexOf('/')).replace('/', '.') : "";
          if (!pkg.equals(expectedPackage) || (library && !pkg.equals(namespace) && !pkg.startsWith(namespace + ".")))
            throw new IllegalArgumentException("Foreign or missing namespace: " + path);
        } else if (!pkg.equals(library ? namespace : "")) throw new IllegalArgumentException("Foreign or missing namespace: " + path);
        if (unit.getTypeDecls().size() != 1 || !(unit.getTypeDecls().get(0) instanceof ClassTree type)
            || type.getKind() != Tree.Kind.CLASS || !type.getSimpleName().contentEquals(expected)
            || !type.getModifiers().getFlags().contains(Modifier.PUBLIC))
          throw new IllegalArgumentException("Exactly one declared public class matching its file is required: " + path);
      }
    }
  }
}
