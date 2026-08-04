# rodin_npc_poll.py — single-pass poll + download for the ZoneNpcs batch.
#
#   python Assets/3D/ZoneNpcs/rodin_npc_poll.py
#
# Reads the ledger written by rodin_npc_jobs.py, asks /status for every job
# not yet downloaded, downloads finished GLBs as rodin_<Name>_raw.glb beside
# this script, and updates the ledger. Prints one line per NPC and a summary;
# exits 0 always (re-run until SUMMARY shows all done/failed).
import json
import os
import re
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
LEDGER = os.path.join(HERE, 'rodin_npc_jobs.json')
ADDON = os.path.join(os.environ['APPDATA'],
                     'Blender Foundation', 'Blender', '5.1',
                     'scripts', 'addons', 'addon.py')


def read_key():
    with open(ADDON, 'r', encoding='utf-8') as f:
        m = re.search(r"RODIN_FREE_TRIAL_KEY\s*=\s*['\"]([^'\"]+)['\"]", f.read())
    if not m:
        sys.exit('RODIN_FREE_TRIAL_KEY not found')
    return m.group(1)


def post_json(key, url, payload):
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode('utf-8'),
        headers={'Authorization': 'Bearer ' + key,
                 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode('utf-8'))


def main():
    key = read_key()
    with open(LEDGER, 'r', encoding='utf-8') as f:
        ledger = json.load(f)
    counts = {'downloaded': 0, 'generating': 0, 'failed': 0, 'unknown': 0}
    for name, rec in ledger.items():
        if rec.get('status') == 'downloaded':
            counts['downloaded'] += 1
            print('DONE %s (already downloaded)' % name)
            continue
        sub_key = rec.get('subscription_key')
        statuses = []
        if sub_key:
            try:
                s = post_json(key, 'https://hyperhuman.deemos.com/api/v2/status',
                              {'subscription_key': sub_key})
                statuses = [j.get('status') for j in s.get('jobs', [])]
            except Exception as e:
                print('POLL-ERR %s: %s' % (name, e))
                counts['unknown'] += 1
                continue
        if statuses and all(st == 'Done' for st in statuses):
            try:
                d = post_json(key, 'https://hyperhuman.deemos.com/api/v2/download',
                              {'task_uuid': rec['uuid']})
                glbs = [it for it in d.get('list', [])
                        if it.get('name', '').lower().endswith('.glb')]
                if not glbs:
                    print('NO-GLB %s: %s' % (name, json.dumps(d)[:300]))
                    counts['unknown'] += 1
                    continue
                out = os.path.join(HERE, 'rodin_%s_raw.glb' % name)
                urllib.request.urlretrieve(glbs[0]['url'], out)
                rec['status'] = 'downloaded'
                rec['file'] = os.path.basename(out)
                counts['downloaded'] += 1
                print('DOWNLOADED %s -> %s (%d KB)'
                      % (name, rec['file'], os.path.getsize(out) // 1024))
            except Exception as e:
                print('DL-ERR %s: %s' % (name, e))
                counts['unknown'] += 1
        elif any(st == 'Failed' for st in statuses):
            rec['status'] = 'failed'
            counts['failed'] += 1
            print('FAILED %s (statuses: %s)' % (name, statuses))
        else:
            counts['generating'] += 1
            print('WAIT %s (statuses: %s)' % (name, statuses))
    with open(LEDGER, 'w', encoding='utf-8') as f:
        json.dump(ledger, f, indent=2)
    print('SUMMARY ' + json.dumps(counts))


if __name__ == '__main__':
    main()
