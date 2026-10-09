import json
import os
import pathlib
import platform
import shutil

root=pathlib.Path(__file__).resolve().parent
(root/'resources-ready.txt').unlink(missing_ok=True)
config=json.load(open(root/'config.json'));game=root/'game';game.mkdir(exist_ok=True)
(game/'options.txt').write_text('fullscreen:false\noverrideWidth:960\noverrideHeight:540\nrenderDistance:8\nmaxFps:40\nguiScale:4\nviewBobbing:true\npauseOnLostFocus:false\ntutorialStep:none\ngamma:1.0\nadvancedItemTooltips:false\nsoundCategory_master:0.0\n')
java=os.environ.get('JAVA')
if java and os.path.sep not in java:java=shutil.which(java)
if not java:java=shutil.which('java')
if not java and platform.system()=='Darwin':
    candidate=root/'java17/Contents/Home/bin/java'
    if candidate.is_file():java=str(candidate)
if not java:raise RuntimeError('Java 17 was not found on PATH')
args=[java,'-javaagent:'+str(root/'native-view-agent.jar')]
if platform.system()=='Darwin':args.append('-XstartOnFirstThread')
args.extend(['-Dagent.mirrorPort='+os.environ.get('NATIVE_MIRROR_PORT','25578'),'-Dagent.captureDir='+str(root),'-Dagent.ffmpeg='+os.environ.get('FFMPEG','ffmpeg'),'-Xmx'+os.environ.get('NATIVE_JAVA_XMX','768M'),'-Dorg.lwjgl.librarypath='+str(root/'natives'),'-Djava.library.path='+str(root/'natives'),'-Dlog4j2.formatMsgNoLookups=true','--add-opens=java.base/java.lang=ALL-UNNAMED','-cp',(root/'classpath.txt').read_text(),config['mainClass'],'--username','AgentView','--version','1.16.5','--gameDir',str(game),'--assetsDir',str(root/'assets'),'--assetIndex',config['assetIndex'],'--uuid','00000000000000000000000000000001','--accessToken','0','--userType','legacy','--width','960','--height','540','--server','127.0.0.1','--port',os.environ.get('NATIVE_MIRROR_PORT','25578')])
os.execv(java,args)
