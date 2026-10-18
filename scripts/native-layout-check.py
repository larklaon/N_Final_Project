#!/usr/bin/env python3
"""Capture question-screen layout on teum-api36; preserves learning DB and restores display settings.
Requires the app and AndroidTest APKs, Metro8081, and an onboarded synthetic learner.
"""
from pathlib import Path
import os
import subprocess
import sys
sdk=os.environ.get('ANDROID_HOME')
if not sdk: raise SystemExit('Set ANDROID_HOME to the Android SDK')
adb=str(Path(sdk)/'platform-tools/adb')
os.chdir(Path(__file__).resolve().parents[1])
base=[adb,'-s',sys.argv[1] if len(sys.argv)>1 else 'emulator-5554']
out=Path('artifacts/review-fixes')
out.mkdir(parents=True,exist_ok=True)
def call(*args):
 return subprocess.check_output(base+list(args),text=True,stderr=subprocess.STDOUT,timeout=65)
assert call('emu','avd','name').splitlines()[0].strip()=='teum-api36'
original={k:call('shell','settings','get','system',k).strip() for k in ['font_scale','accelerometer_rotation','user_rotation']}
density=call('shell','wm','density')
assert 'Override' not in density, density
try:
 call('reverse','tcp:8081','tcp:8081')
 for name,density,font,rotation in [('phone360-100',480,'1.0','0'),('phone360-200',480,'2.0','0'),('phone412-100',420,'1.0','0'),('phone412-200',420,'2.0','0'),('rotation-lock-100',420,'1.0','1')]:
  call('shell','am','force-stop','com.teumknowledge.app')
  call('shell','settings','put','system','font_scale',font)
  call('shell','wm','density',str(density))
  call('shell','settings','put','system','accelerometer_rotation','0')
  call('shell','settings','put','system','user_rotation',rotation)
  # A crashed instrumentation process may never reach its screenshot finally block.
  # Remove old captures first so a prior build's image cannot be mistaken for evidence.
  for ext in ['png','xml']:
   (out/(name+'.'+ext)).unlink(missing_ok=True)
   call('shell','rm','-f',f'/sdcard/Android/data/com.teumknowledge.app/files/{name}.{ext}')
  log=call('shell','am','instrument','-w','-e','class','com.teumknowledge.app.LayoutTest','-e','captureName',name,'com.teumknowledge.app.test/androidx.test.runner.AndroidJUnitRunner')
  (out/(name+'.log')).write_text(log)
  print(name,log.strip(),flush=True)
  for ext in ['png','xml']:
   try:
    call('pull',f'/sdcard/Android/data/com.teumknowledge.app/files/{name}.{ext}',str(out/(name+'.'+ext)))
   except subprocess.CalledProcessError:
    if 'OK (1 test)' in log: raise
    print(f'{name}: no fresh {ext} capture (test process may have crashed)',flush=True)
  assert 'OK (1 test)' in log,name
finally:
 call('shell','am','force-stop','com.teumknowledge.app')
 call('shell','wm','density','reset')
 for key,value in original.items():call('shell','settings','put','system',key,value)
 print('RESTORED',original,flush=True)
