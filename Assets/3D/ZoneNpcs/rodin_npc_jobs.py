# rodin_npc_jobs.py — submit the 12-zone-NPC Rodin Sketch batch headlessly.
#
#   python Assets/3D/ZoneNpcs/rodin_npc_jobs.py
#
# Stdlib-only (system python has no `requests`). Resume-safe: names already in
# the ledger are skipped, so a partial run can simply be re-run. Ledger lives
# beside this script (rodin_npc_jobs.json) per the house convention so polling
# survives session loss. Poll + download with rodin_npc_poll.py.
import json
import os
import re
import sys
import time
import urllib.request
import uuid as uuidlib

HERE = os.path.dirname(os.path.abspath(__file__))
LEDGER = os.path.join(HERE, 'rodin_npc_jobs.json')
ADDON = os.path.join(os.environ['APPDATA'],
                     'Blender Foundation', 'Blender', '5.1',
                     'scripts', 'addons', 'addon.py')

# House style stem (Plans/Art_prompt_generic) adapted for a 3D character roll,
# + the proven character formula (Duskdart/Warden/Delver lessons): upright,
# symmetrical, big glossy eyes, simple friendly face, nothing held in hands
# (humanoid-holding-object is a known Rodin text-mode weakness), no base slab.
STEM = ('westernized anime style game character, clean confident outlines, '
        'flat color with soft gradient shading, strong silhouette read, '
        'inspired by Rick and Morty, Avatar: The Last Airbender, and Studio '
        'Ghibli. A full-body 3D character: ')
SUFFIX = (' Standing fully upright on two legs, symmetrical pose, arms '
          'relaxed at the sides, flat feet on the ground, no held objects, '
          'calm simple friendly face, two very large glossy dark eyes, '
          'full body, single character, no base, no pedestal.')

NPCS = [
    ('Npc_Cindersmith',
     'a tall salamander-folk blacksmith, smooth obsidian-black skin with '
     'glowing orange magma cracks across the shoulders and forearms, heavy '
     'dark leather smith\'s apron and thick belt.'),
    ('Npc_Stoker',
     'a short round newt-folk furnace stoker, soot-grey skin with glowing '
     'ember-orange freckles, oversized leather work gloves and a thick '
     'knitted collar scarf.'),
    ('Npc_Tidecaller',
     'a slender axolotl-folk tide priest, pale luminous pink-white skin, '
     'frilled external gill branches fanned around the head like a soft '
     'crown, long kelp-green woven robe with wave patterns.'),
    ('Npc_Salvager',
     'a stocky octopus-folk salvager, weathered teal skin, short tentacle '
     'beard under a round face, rope harness with small net pouches over '
     'one shoulder.'),
    ('Npc_Tusker',
     'a burly walrus-folk trapper, warm brown whiskered muzzle with two '
     'short ivory tusks, heavy hooded fur parka with a wide leather belt '
     'and snow boots.'),
    ('Npc_Snowl',
     'a snowy-owl-folk stargazer, round white feathered head with faint '
     'grey speckles, deep indigo cloak patterned with tiny stars, small '
     'folded wings tucked under the cloak.'),
    ('Npc_Rimeseer',
     'a crystalline ice-being, translucent pale-blue faceted crystal body, '
     'a softly glowing white core in the chest, jagged frost crystal '
     'shoulders.'),
    ('Npc_Bonecarver',
     'a shaggy musk-ox-folk hermit, long dark wool fur coat, two small '
     'curved horns, a necklace of carved bone beads.'),
    ('Npc_Mothtender',
     'a gentle moth-folk lantern keeper, dusty cream and amber fur, two '
     'large feathered antennae, wings folded flat down the back like a '
     'long patterned cloak.'),
    ('Npc_Glimmer',
     'a small round firefly-folk lamplighter, dark teal shell, a softly '
     'glowing warm amber belly like a paper lantern, two tiny antennae.'),
    ('Npc_Deepvark',
     'a mole-folk prospector, soft grey velvet fur, a leather mining helmet '
     'with a small glowing headlamp, sturdy work overalls, large gentle '
     'digging claws resting at the sides.'),
    ('Npc_Geode',
     'a pangolin-folk crystal assayer, overlapping stone-grey scale plates '
     'studded with glowing purple crystal clusters along the back and '
     'shoulders.'),
]

BBOX = [1, 1, 2]  # upright character bias


def read_key():
    with open(ADDON, 'r', encoding='utf-8') as f:
        m = re.search(r"RODIN_FREE_TRIAL_KEY\s*=\s*['\"]([^'\"]+)['\"]", f.read())
    if not m:
        sys.exit('RODIN_FREE_TRIAL_KEY not found in ' + ADDON)
    return m.group(1)


def multipart(fields):
    boundary = '----rodin' + uuidlib.uuid4().hex
    parts = []
    for k, v in fields.items():
        parts.append('--' + boundary)
        parts.append('Content-Disposition: form-data; name="%s"' % k)
        parts.append('')
        parts.append(str(v))
    parts.append('--' + boundary + '--')
    body = '\r\n'.join(parts).encode('utf-8')
    return body, 'multipart/form-data; boundary=' + boundary


def submit(key, prompt):
    body, ctype = multipart({
        'tier': 'Sketch',
        'mesh_mode': 'Raw',
        'prompt': prompt,
        'bbox_condition': json.dumps(BBOX),
    })
    req = urllib.request.Request(
        'https://hyperhuman.deemos.com/api/v2/rodin', data=body,
        headers={'Authorization': 'Bearer ' + key, 'Content-Type': ctype})
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.loads(r.read().decode('utf-8'))


def main():
    key = read_key()
    ledger = {}
    if os.path.exists(LEDGER):
        with open(LEDGER, 'r', encoding='utf-8') as f:
            ledger = json.load(f)
    for name, desc in NPCS:
        if name in ledger and ledger[name].get('uuid'):
            print('SKIP %s (already submitted)' % name)
            continue
        prompt = STEM + desc + SUFFIX
        try:
            r = submit(key, prompt)
        except Exception as e:
            print('FAIL %s: %s' % (name, e))
            continue
        task_uuid = r.get('uuid')
        sub_key = (r.get('jobs') or {}).get('subscription_key')
        if not task_uuid:
            print('FAIL %s: unexpected response %s' % (name, json.dumps(r)[:400]))
            continue
        ledger[name] = {'uuid': task_uuid, 'subscription_key': sub_key,
                        'prompt': prompt, 'status': 'submitted'}
        with open(LEDGER, 'w', encoding='utf-8') as f:
            json.dump(ledger, f, indent=2)
        print('OK   %s -> %s' % (name, task_uuid))
        time.sleep(1.0)
    print('DONE %d/%d in ledger' % (len(ledger), len(NPCS)))


if __name__ == '__main__':
    main()
