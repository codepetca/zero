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
        boolean library = path.toString().contains("/src/");
        String pkg = unit.getPackageName() == null ? "" : unit.getPackageName().toString();
        if (!pkg.equals(library ? namespace : "")) throw new IllegalArgumentException("Foreign or missing namespace: " + path);
        if (unit.getTypeDecls().size() != 1 || !(unit.getTypeDecls().get(0) instanceof ClassTree type)
            || type.getKind() != Tree.Kind.CLASS || !type.getSimpleName().contentEquals(expected)
            || !type.getModifiers().getFlags().contains(Modifier.PUBLIC))
          throw new IllegalArgumentException("Exactly one declared public class matching its file is required: " + path);
      }
    }
  }
}
