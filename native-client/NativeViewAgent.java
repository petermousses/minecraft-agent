package local.agentview;
import java.lang.instrument.*;import java.security.ProtectionDomain;import javassist.*;
public class NativeViewAgent {
 public static void premain(String args,Instrumentation inst){
  inst.addTransformer(new ClassFileTransformer(){public byte[] transform(ClassLoader loader,String name,Class<?> cls,ProtectionDomain domain,byte[] bytes){
   if(!name.equals("org/lwjgl/glfw/GLFW")&&!name.equals("djz")&&!name.equals("dnt"))return null;
   try{ClassPool pool=new ClassPool(true);pool.appendClassPath(new LoaderClassPath(loader));CtClass c=pool.makeClass(new java.io.ByteArrayInputStream(bytes));if(name.equals("org/lwjgl/glfw/GLFW")){for(CtMethod m:c.getDeclaredMethods("glfwSetWindowIcon"))m.setBody("{}");for(CtMethod m:c.getDeclaredMethods("glfwShowWindow"))m.setBody("{}");
   for(CtMethod m:c.getDeclaredMethods("glfwFocusWindow"))m.setBody("{}");
   for(CtMethod m:c.getDeclaredMethods("glfwSetCursorPos"))m.setBody("{}");
   for(CtMethod m:c.getDeclaredMethods("glfwSetInputMode"))m.insertBefore("{if($2==0x00033001)return;}");
   for(CtMethod m:c.getDeclaredMethods("glfwCreateWindow"))m.insertBefore("{glfwWindowHint(0x00020004,0);}");
   c.getDeclaredMethod("glfwInit").insertBefore("{if(System.getProperty(\"os.name\").startsWith(\"Mac\"))glfwInitHint(0x00051002,0);}");
   c.getDeclaredMethod("glfwSwapBuffers").insertBefore("{local.agentview.FrameCapture.frame($1);}");}
   if(name.equals("djz"))c.getDeclaredMethod("s",new CtClass[0]).setBody("{return true;}");
   if(name.equals("dnt")){c.getDeclaredMethod("a",new CtClass[]{pool.get("java.lang.String"),CtClass.intType}).insertBefore("{if (!$1.equals(\"127.0.0.1\") || $2 != Integer.getInteger(\"agent.mirrorPort\", 25578).intValue()) throw new SecurityException(\"This display client only connects to the local read-only mirror\");}");}byte[] out=c.toBytecode();c.detach();System.out.println("Native view: hidden-window compatibility hooks active");return out;}catch(Exception e){e.printStackTrace();return null;}
  }});
 }
}
