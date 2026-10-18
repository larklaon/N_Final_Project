#!/usr/bin/env python3
"""Non-destructive cold-start/navigation probe. Needs an onboarded teum-api36 and Metro.
Does not authenticate, answer questions, change preferences or clear learning data.
"""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import time
import xml.etree.ElementTree as ET

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--serial', default='emulator-5554')
parser.add_argument('--runs', type=int, default=20)
parser.add_argument('--out', default='artifacts/screens-fix/startup')
args = parser.parse_args()
assert args.runs > 0
sdk = os.environ.get('ANDROID_HOME')
if not sdk:
    raise SystemExit('Set ANDROID_HOME')
base = [str(Path(sdk) / 'platform-tools/adb'), '-s', args.serial]
package = 'com.teumknowledge.app'
out = Path(args.out)
out.mkdir(parents=True, exist_ok=True)


def adb(*command):
    return subprocess.check_output(base + list(command), text=True, stderr=subprocess.STDOUT, timeout=45)


def dump():
    adb('shell', 'rm', '-f', '/sdcard/teum-startup-probe.xml')
    adb('shell', 'uiautomator', 'dump', '/sdcard/teum-startup-probe.xml')
    return adb('shell', 'cat', '/sdcard/teum-startup-probe.xml')


def wait_screen(predicate, timeout=30):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            xml = dump()
            tree = ET.fromstring(xml)
        except (subprocess.CalledProcessError, ET.ParseError):
            time.sleep(0.5)
            continue
        if predicate(tree):
            return xml
        time.sleep(0.5)
    raise AssertionError('Expected React screen did not appear')


def is_question(tree):
    return any(n.get('content-desc', '').startswith('퍼즐 보기') for n in tree.iter('node'))


def tap_label(label, prefix=False):
    tree = ET.fromstring(dump())
    node = next(n for n in tree.iter('node') if
                (n.get('content-desc', '').startswith(label) if prefix else n.get('content-desc') == label))
    x1, y1, x2, y2 = map(int, re.findall(r'\d+', node.attrib['bounds']))
    assert x2 > x1 and y2 > y1, 'Target not visible'
    adb('shell', 'input', 'tap', str((x1+x2)//2), str((y1+y2)//2))


assert adb('emu', 'avd', 'name').splitlines()[0].strip() == 'teum-api36'
original = {k: adb('shell', 'settings', 'get', 'system', k).strip()
            for k in ['accelerometer_rotation', 'user_rotation']}
results = []
try:
    adb('reverse', 'tcp:8081', 'tcp:8081')
    adb('shell', 'wm', 'user-rotation', 'lock', '0')
    for run in range(1, args.runs+1):
        start = adb('shell', 'date', '+%m-%dT%H:%M:%S.000').strip().replace('T', ' ')
        adb('shell', 'am', 'force-stop', package)
        adb('shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d',
            'exp+teum-knowledge://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081', '-p', package)
        xml = wait_screen(is_question)
        pid = adb('shell', 'pidof', package).strip()
        assert pid
        navigation = run % 5 == 0
        if navigation:
            for label, prefix, title in [('설정', False, '설정'), ('퍼즐 보기', True, '퍼즐')]:
                tap_label(label, prefix)
                wait_screen(lambda t: not is_question(t) and any(n.get('text') == title for n in t.iter('node')))
                adb('shell', 'input', 'keyevent', '4')
                wait_screen(is_question)
            for rotation in ['1', '0']:
                adb('shell', 'wm', 'user-rotation', 'lock', rotation)
                xml = wait_screen(lambda t: is_question(t) and t.get('rotation') == rotation)
        time.sleep(2)
        assert adb('shell', 'pidof', package).strip() == pid, 'App process died or restarted'
        crashes = adb('logcat', '-b', 'crash', '-d', '-v', 'threadtime', '-T', start)
        (out / f'{run:02d}-crash.log').write_text(crashes)
        assert package not in crashes, 'App crash recorded; inspect per-run crash log'
        (out / f'{run:02d}.xml').write_text(xml)
        results.append({'run': run, 'pid': pid, 'questionVisible': True, 'navigationAndRotation': navigation, 'appCrashes': 0})
        (out / 'results.json').write_text(json.dumps(results, indent=2)+'\n')
        print(f'{run}/{args.runs}: React screen ready; same PID; navigation/rotation={navigation}; no app crash', flush=True)
finally:
    adb('shell', 'am', 'force-stop', package)
    for key, value in original.items():
        adb('shell', 'settings', 'put', 'system', key, value)
    adb('shell', 'rm', '-f', '/sdcard/teum-startup-probe.xml')
    print(f'Restored rotation settings: {original}', flush=True)
