# Spike 6: Inventory engine contract

**Question:** which names in `inventorymenu.swf` does the Skyrim executable actually need (it calls them or looks them up), and which are just how SkyUI happens to be built? The answer is layer 1 ("engine contract") of the layered contracts in the design spec.

**Output:** `inventory.contract.draft.json`, a draft data file. Draft schema `0.0-draft`. It is not a Zod schema yet. Entries are sorted by `id`, and ids are stable.

## Method

1. Started from a Haiku sweep of doodlum/SkyUI-Community @ `b7a24a9` (source AS, FFDec XML, Papyrus). It was only a lead: I checked every load-bearing claim against the files myself (see "Verified").
2. **Cross-check against vanilla.** I extracted `interface/inventorymenu.swf` from the user's `Skyrim - Interface.bsa` (game 1.7.104 AE, archive sha256 `e3d0c8d1…24de`) using the spike-5 BSA reader's existing git-ignored `.cache`. I decompiled it with FFDec 26.3.0 (`-export script`, `-swf2xml`) into the session scratchpad only. No vanilla file was copied into any repo.
3. I decompiled SkyUI's built `data/interface/inventorymenu.swf` the same way, so I compared compiled output with compiled output and not only the AS source.
4. I dumped the timeline structure of both (frame labels, named placements, stage) with a small XML reader.
5. **The rule:** the same name and signature in vanilla and SkyUI, in a role where nothing in AS calls or fills it, counts as **engine-required (high)**. Present in both but used only by AS counts as a **base convention**. Anything that differs between the two **cannot** be engine-required, because both SWFs work with the same executable.

No C++ source was available, so "the engine calls X" is always an inference, never something I observed.

## Results

Counts: 10 instances, 24 functions, 11 callbacks, 2 frame labels, 4 SKSE hooks, 7 unknowns. 21 entries are marked `required: true`.

**Engine-required (high confidence)**

- **Root functions** (engine → AS, on `_root`): `InitExtensions()`, `SetPlatform(aiPlatform, abPS3Switch)` and `GetInventoryItemList()`. The frame-1 text is the same in both SWFs, and no AS calls them.
- **The bridge:** `gfx.io.GameDelegate` registers ExternalInterface callbacks `"call"` and `"respond"`. Outgoing calls go out as `ExternalInterface.call(methodName, uid, ...args)`. A replacement should reuse GameDelegate.
- **GameDelegate callbacks** (engine → AS), registered with the same names in both: `AttemptChargeItem`, `AttemptEquip`, `DropItem`, `InvalidateListData`, `ItemRotating`, `RestoreIndices`, `SetCategoriesList`, `ToggleMenuFade`, `UpdateItemCardInfo`, `UpdatePlayerInfo`. They are all registered inside `InitExtensions`. A missing one is a silent no-op, not a crash.
- **AS → engine calls**, the same 17 names and args in both: `CheckForMouseEquip`, `CloseMenu`, `CloseTweenMenu`, `DisabledItemSelect`, `ItemCardListCallback`, `ItemDrop`, `ItemSelect`, `PlaySound`, `QuantitySliderOpen`, `RequestItemCardInfo`, `SaveIndices`, `ShowSoulGemList`, `ShowTweenMenu`, `StartMouseRotation`, `StopMouseRotation`, `UpdateItem3D`, `ZoomItemModel`. Only `CloseMenu`, `ItemSelect`, `ItemDrop` and `RequestItemCardInfo` are marked required, since a working menu needs them. The rest are needed only for their feature.
- **The item list object:** whatever `GetInventoryItemList()` returns must have an `entryList` Array. Neither SWF ever writes into the item list's `entryList`, yet both read it, so the engine fills it through that returned object, not through a path. That is why the list's instance name is free.
- **Menu name:** `InventoryMenu`. Evidence: SkyUI `SKI_SettingsManager.psc` `RegisterForMenu("InventoryMenu")`, and `skse.OpenMenu("InventoryMenu")` in MagicMenu.

**Not engine-required (strong evidence: they differ between vanilla and SkyUI)**

- Every child of `Menu_mc` is renamed. Vanilla has `InventoryLists_mc`, `BottomBar_mc`, `ItemCardFadeHolder_mc`, `MouseRotationRect`, `ExitMenuRect`, `ItemsListInputCatcher` and `RestoreCategoryRect`. SkyUI has `inventoryLists`, `bottomBar`, `itemCardFadeHolder`, `mouseRotationRect` and `exitMenuRect`. So `inventoryLists`, `bottomBar`, ItemCard internals and the like belong in the SkyUI base layer.
- Frame rate: vanilla runs at 30 fps, SkyUI at 60.
- The `SaveIndices`/`RestoreIndices` payload. The names are engine-required, but the shape is defined by the SWF: vanilla saves a scroll position plus one value per category, SkyUI saves 5 values, and the engine echoes back whatever it was given.
- Response handler names. `RequestItemCardInfo` replies to whatever handler AS names: `UpdateItemCardInfo` in both, `updateItemInfo` in SkyUI's ItemcardDataExtender.

**Base conventions (in both, but only AS uses them):** root labels `fadeOut` (frame 2) and `fadeIn` (frame 7), the frame-1 call to `SetFadedIn` and the frame-6 call to `onFadeCompletion`, 11 root frames, the 1280x720 stage, `ItemCard_mc` as a leaf name, and `InventoryMenuObj`/`registerClass`.

**Unknown (needs an in-game test):** whether the engine resolves `_root.Menu_mc` itself, whether `handleInput` is reached only through CLIK, whether the engine calls `InvalidateData()` on the list directly, `SetButtonMapping` (vanilla only, so optional), the vanilla-only `myLog`, and the fields the engine writes into entries and info objects. That last one is a data contract, so the observed reads are only listed in notes.

## Flagged inconsistencies

1. **`skse.OpenMenu("Inventory Menu")`** at SkyUI `ItemMenu.as:485` (in `resetMenu`) uses a space. Every other use is `"InventoryMenu"` (`MagicMenu.as:120`, `:157`; `SKI_SettingsManager.psc:7`). This looks like a SkyUI bug on a rare path. Check in game whether it opens anything.
2. **Sweep error:** it listed four root wrappers including `SetFadedIn()`. Both decompiled SWFs show only three root functions. `SetFadedIn` is a call (`Menu_mc.SetFadedIn()`) on frame 1.
3. **Sweep framing:** it listed `Menu_mc` methods (for example `onFadeCompletion` and `onMouseRotation*`) as engine-called. The engine reaches `Menu_mc` only through the root wrappers and GameDelegate. The rest are wired up inside AS (the timeline, MouseRotationInputCatcher, Mouse listeners).
4. `InitExtensions(abPlayBladeSound)` takes an argument in both class implementations, but the root wrapper passes none, so the engine never supplies it.

## Verified vs. taken from the sweep

I verified these myself, against the decompiled vanilla SWF, the decompiled SkyUI SWF and the SkyUI source:

- the root frame scripts
- all `addCallBack` and `GameDelegate.call` sites, with line numbers
- the GameDelegate wire format
- the `Menu_mc` children and frame labels in both SWFs
- `GetInventoryItemList`, `RestoreIndices`/`saveIndices`, `SetCategoriesList` and `InvalidateListData`
- the `skse.*` calls and the `OpenMenu` strings
- the Papyrus menu name
- the license facts below

I did not re-verify the sweep's BottomBar and ItemCard internals (frame labels, text fields) or its ConfigManager bytecode notes. They are SkyUI base layer anyway, so they are left out of this file.

## Limits

- There is no executable-side evidence. "Engine-required" means "every working inventory SWF we have provides it, and nothing in AS uses it". Something the engine calls that both SWFs happen to omit would not show up here.
- The vanilla SWF comes from one game version (1.7.104 AE). SE 1.5.97 and VR may differ.
- `required` is a judgment of what a minimal working inventory needs, not something the engine enforces. Missing callbacks fail silently.
- The draft is not yet a Zod schema. Fields like `class`, `on` and `response` are proposals for the real schema.

## License answer

**SkyUI-Community (doodlum):**

- There is no license. No LICENSE file exists in the clone or in the repo's history (the GitHub commits API shows 0 commits touching `LICENSE`, `LICENSE.md` or `LICENSE.txt`), and the GitHub API reports `license: null`.
- No license means all rights reserved by default: there is no grant to copy or redistribute its code or SWFs.
- The repo is not a GitHub fork of the upstream repo.
- The FFDec tools it bundles under `tools/FFDec/` carry their own GPL/LGPL and other licenses. Those cover FFDec, not SkyUI.

**Upstream SkyUI (schlangster/skyui):** I verified these from GitHub over the web, not from the depth-1 clone:

- It also has no LICENSE file, ever: 0 commits touch `LICENSE*` or `COPYING`, and the API reports `license: null`.
- Its README of 2012-06-30 (commit `9cd9289`) had a "Permission instructions" section. It said: *"You may not use non-trivial parts of SkyUI in your mod unless given explicit permission"*. The reconstructed vanilla sources in the separate skyrimui SDK repo could be used with credit.
- The README edits of 2015-05-17 (`4578e40`, `8354287`) removed that section. The current README keeps only a warranty disclaimer borrowed from the MIT license text. That disclaimer is not a license grant.
- I did **not** check the SkyUI Nexus permissions page. From memory only: Nexus permissions for SkyUI were restrictive. Treat this as unverified.

**Bethesda-derived files:** `data/interface/*.swf` in that repo is built from Bethesda's vanilla SWFs (`source/swf/*.xml` are full SWF exports). Even if SkyUI were licensed, those files contain Bethesda content and cannot be redistributed. This matches the spec's rule that vanilla SWFs are never shipped.

**What this means for the spec's "Check its license before bundling" (my reading, not legal advice):**

- Bundling is not possible today. There is no license to check, so Inkwell cannot bundle SkyUI SWFs or AS classes without explicit permission from the authors. The Bethesda-derived SWFs cannot be bundled in any case.
- The contract file is a different matter. It holds facts about an interface: callback and function names, argument order, which names the engine needs. It holds no copied code, art or SWF bytes. Interface names needed for interoperability are generally treated as facts rather than protected expression, and the Skyrim modding scene has long documented these names publicly.
- To stay on the safe side:
  - store names, signatures and short factual notes only
  - never copy AS bodies, decompiled code or SWF data into the repo
  - cite file:line as a reference, not a quote
  - do not ship anything extracted from the user's install
- The engine-layer names are also confirmed by the user's own vanilla SWF, so they do not depend on SkyUI at all.
- A SkyUI base layer (its instance names and class structure) depends more on SkyUI's specific design. It is still names and facts, but asking the SkyUI-Community maintainers before publishing it is cheap and avoids any doubt.
