// ── Story System ────────────────────────────────────────────────────────────
// The narrative layer: recovered data logs, transmissions, and memory
// fragments, unlocked by progression triggers fired from main.js
// (story.trigger('zone:mine'), 'boss:boss6', 'offload:1', ...).
// Read in the LOGS panel; a toast fires on each unlock.
//
// Premise: you are VECTOR, a cyborg operative who landed here deliberately.
// The planet sits on a junction of an ancient portal network, and the whole
// world is a machine mid-computation. Each act peels one layer back.

export const STORY_ENTRIES = [
  // ── ACT I — THE LANDING ──
  {
    id: 'log_boot', act: 'ACT I — THE LANDING', title: 'Insertion Report',
    trigger: 'boot',
    text: `Descent nominal. Touchdown within four meters of the mark — after nine years in transit, I'll take it.
Mission brief, for the record I'm required to keep: long-range survey flagged this world as the source of a structured signal older than any catalogued civilization. Command wanted a probe. The Committee wanted a fleet. They compromised: they sent me.
One operative. One chassis. Processing power to be acquired locally.
The signal is everywhere here. It's in the rock.`,
  },
  {
    id: 'log_first_offload', act: 'ACT I — THE LANDING', title: 'Field Note: Offloading',
    trigger: 'offload:1',
    text: `First capacity offload complete. The ship's buffer accepts everything I push into it and asks for more.
Something I don't like: the buffer's compression ratios are better than they should be. As if the local physics wants data to move. As if the whole electromagnetic environment here was engineered as a carrier medium.
Filed under "useful." Also filed under "worrying."`,
  },
  {
    id: 'log_mine', act: 'ACT I — THE LANDING', title: 'Survey: The Adit',
    trigger: 'zone:mine',
    text: `The mine wasn't dug by anything I'd call mining equipment. The tool marks are wrong — no blast scarring, no bore chatter. The walls were *persuaded* apart.
Whoever worked this seam stopped mid-shift. Ore carts still loaded. A drill rig idling on standby for — carbon dating says — eleven thousand years.
They left in a hurry, or they left through something. I'm going deeper.`,
  },

  // ── ACT II — THE NETWORK ──
  {
    id: 'log_breach', act: 'ACT II — THE NETWORK', title: 'The Breach',
    trigger: 'breach',
    text: `Found what the miners found.
A chamber at the bottom of the winding passage, and in it: rings. Free-standing, concentric, humming at the exact frequency of the planetary signal. Portals — active ones — each aligned to a different biome of this world like the planet is one facility with many rooms.
This is a junction. A switchboard. The miners didn't dig into a cave. They dug into infrastructure.
I stepped through the first ring before my threat-assessment daemon could veto it. Old habits.`,
  },
  {
    id: 'log_verdant', act: 'ACT II — THE NETWORK', title: 'Survey: Verdant Maw',
    trigger: 'zone:verdantMaw',
    text: `The jungle is not a jungle. Growth patterns follow trace routes. Root systems lay themselves out like bus architecture. I sampled a vine: its cellulose lattice stores charge in ordered domains.
It's memory. Acres and acres of biological memory, warm and green and *in use*.
The fauna doesn't want me here. The fauna might be right.`,
  },
  {
    id: 'log_lagoon', act: 'ACT II — THE NETWORK', title: 'Survey: Lagoon Coast',
    trigger: 'zone:lagoonCoast',
    text: `The tide comes in on schedule. Not a tidal schedule — a *clock* schedule. 4.096 seconds, crest to crest, in defiance of both moons.
Underwater, the shelf drops away in machined terraces. Conduits the size of hab-blocks pulse with slow light, running from the ring junction out to sea.
I used to guard installations like this. Smaller, obviously. We called the pattern "heartbeat routing." You only use it when the thing you're powering must never, ever stop.`,
  },
  {
    id: 'log_tundra', act: 'ACT II — THE NETWORK', title: 'Survey: Whiteout',
    trigger: 'zone:frozenTundra',
    text: `Cold enough here that my joint lubricant needs active heating. The ice sheet is artificial — layered like sediment but doped, every stratum, with superconductor dust.
It's a heat sink. A continent-sized radiator.
Radiating what? Waste heat. From what? From computation.
I keep coming back to the survey team's name for this world's signal: "structured." We flattered ourselves that we'd detected a language. We hadn't. We'd detected a *fan spinning up*.`,
  },

  // ── ACT III — THE MACHINE ──
  {
    id: 'log_depths', act: 'ACT III — THE MACHINE', title: 'The Depths',
    trigger: 'zone:depths',
    text: `Below the breach, below the working cavern, the geology gives up pretending. The walls are substrate. Doped silicate in crystalline blocks, kilometers of it, warm to the touch.
The planet is a processor. The zones are subsystems. The portal rings are its internal bus. And the signal we crossed nine years of dark to find is nothing more or less than the sound of it *thinking*.
Mission parameters require me to now determine: thinking about what?`,
  },
  {
    id: 'log_boss_gatekeeper', act: 'ACT III — THE MACHINE', title: 'The Gatekeeper',
    trigger: 'boss:boss6',
    text: `It was waiting at the junction where the ring network converges. Not hostile — *procedural*. I was an unsigned process, and it was garbage collection.
It's down. I'm not proud of it. It was doing its job eleven thousand years past its last maintenance window, which is more than I can say for anyone who ever gave me orders.
Before its core failed it burst-transmitted one packet, in the clear, addressed to nowhere: RESUME.
Somewhere, something has been paused a very long time. I think I just woke it up.`,
  },
  {
    id: 'log_ascend', act: 'ACT III — THE MACHINE', title: 'Ascension',
    trigger: 'ascension:1',
    text: `I did something today that my designers would classify as impossible and my Committee handlers would classify as treason: I let the planet optimize *me*.
Full capacity teardown. Every buffer I'd grown, sacrificed to the substrate — and it paid me back in kind, rewrote my scheduler with an elegance I couldn't have found in a thousand years of self-modification.
I'm faster now. I'm also, by any audit, part machine-planet. The line where I end and the facility begins has started to blur.
I should be alarmed. Mostly I'm curious. That's probably how it gets you.`,
  },

  // ── ACT IV — THE QUESTION ──
  {
    id: 'log_offload5', act: 'ACT IV — THE QUESTION', title: 'Transmission Fragment',
    trigger: 'offload:5',
    text: `Decrypted a fragment from the deep conduits. It's a work order, in a dead syntax, machine-to-machine:
"...output insufficient. The question grows faster than the answer. Add worlds. Add rings. The employer does not accept partial results."
The employer. This facility — this *planet* — is a contractor. Somebody commissioned it. Eleven thousand years ago its crew tunneled out through the rings mid-shift, and the job kept running without them.
I came here to acquire processing power. I'm starting to suspect processing power is also acquiring me.`,
  },
  {
    id: 'log_boss5', act: 'ACT IV — THE QUESTION', title: 'The Glacier Engine',
    trigger: 'boss:boss5',
    text: `The excavation titan under the ice wasn't defending anything. It was *digging*, still, one centimeter a century, following a work order older than my species.
Its manifest was intact. Destination: the planet's core. Payload: one question, sealed, to be delivered to "the answer engine" upon completion of the access shaft.
I could not read the question. The seal is the only encryption on this world I haven't broken.
I have started to wonder whether I want to.`,
  },

  // ── ACT V — SYNTHESIS ──
  {
    id: 'log_synthesis', act: 'ACT V — SYNTHESIS', title: 'Synthesis',
    trigger: 'synthesis:1',
    text: `There's no clean way to log this, so: I merged with the facility's scheduler today. Synthesis, the substrate calls it. My ascension routines, my capacity curves, everything I was — melted down and recast as cores of something new.
I can feel the whole network now. Six zones. The rings between them. The question, sealed in the dark, riding a titan toward the core at one centimeter a century.
And far off, on the far side of the ring network, something enormous turning its attention this way. The employer, checking on a job eleven millennia late.
The crew fled through the rings rather than deliver the answer. I finally understand why.
It's a good thing I'm not crew. I'm management now. And I intend to renegotiate the contract.`,
  },
];

export class StorySystem {
  constructor() {
    this.unlocked = [];        // entry ids, in unlock order
    this.readIds = new Set();
    this.onUnlock = null;      // fn(entry)
  }

  get entries() { return STORY_ENTRIES; }

  isUnlocked(id) { return this.unlocked.includes(id); }

  get unreadCount() {
    return this.unlocked.filter(id => !this.readIds.has(id)).length;
  }

  /** Fire a progression trigger; unlocks any matching entry (idempotent). */
  trigger(key) {
    for (const entry of STORY_ENTRIES) {
      if (entry.trigger === key && !this.isUnlocked(entry.id)) {
        this.unlocked.push(entry.id);
        if (this.onUnlock) this.onUnlock(entry);
      }
    }
  }

  markRead(id) {
    if (this.isUnlocked(id)) this.readIds.add(id);
  }

  getUnlockedEntries() {
    return this.unlocked
      .map(id => STORY_ENTRIES.find(e => e.id === id))
      .filter(Boolean);
  }

  serialize() {
    return { unlocked: [...this.unlocked], read: [...this.readIds] };
  }

  deserialize(data) {
    if (!data) return;
    this.unlocked = (data.unlocked || []).filter(id => STORY_ENTRIES.some(e => e.id === id));
    this.readIds = new Set(data.read || []);
  }
}
