NINECUBE DIGITAL - LIVE SYSTEM WALKTHROUGH

Play ninecube-walkthrough.mp4 by double-clicking it, or run PLAY-VIDEO.cmd.
The MP4 contains its own narration. No local server, browser, database or
separate WAV file is required to watch it. A standard H.264/AAC desktop
player such as Windows Media Player or VLC can play the file.

The picture is a fresh recording of the running application and real API.
Narration uses the installed Microsoft David Desktop synthetic voice.
Animated scene cards, cursor highlights, click rings, captions and progress
are captured with the application. Long waits are accelerated by at most 2x;
the whole spoken commentary fits each scene. The MP4 has chapter markers
and optional English subtitles. Original source tracks are retained.

Workflows: public showcase, invalid and valid registration, password
visibility, sign-in, catalogue filters, laptop configurations and galleries,
stock cap, concurrent stock conflict, successful order recovery, order
history and invoice prices, dashboard, notifications, refused negative
stock adjustment, inventory receipt and movement ledger, safe bulk review,
category-cycle rejection, sales, bulk order confirmation and shipping,
invoice viewing, customer shipment timeline, administrator roles/audit/settings.

This demonstration creates a test customer account and two demonstration
orders, receives stock with a recorded reason, and fulfils those demo orders.
It does not deactivate the selected product batch or change the category tree.
The demo stock receipt is part of the visible workflow, not a silent reset.

verification.json reports actual codecs, sound level, full-file decode and
scene results. scenes.json describes the uncut recording; standalone-scenes.json
records the edited MP4 chapter timings and original capture ranges. The old
walkthrough was preserved under archive/ before re-recording.

Rebuild from the repository root, with the application servers running:
  node tools/prepare-walkthrough-narration.mjs
  node web/scripts/record-walkthrough.mjs
  python tools/export_walkthrough.py
  node tools/render-walkthrough-player.mjs

Full FFmpeg is required at tools/media-tools/ffmpeg.exe. The small Playwright
FFmpeg executable cannot encode H.264 or AAC and is not suitable for export.
