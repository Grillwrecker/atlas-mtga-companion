ATLAS MTGA COMPANION v1.0.0
===========================

Purpose
-------
Private-first iPhone companion for the Atlas MTGA Collection Extractor.
The app does NOT extract from MTG Arena on iPhone. The Windows extractor remains the collection reader.

v1 workflow
-----------
1. Atlas MTGA Extractor on Windows writes phone-ready files to iCloud Drive/Atlas MTGA/<Profile>/.
2. Open Atlas MTGA Companion on iPhone.
3. Choose Erin or Kaliyah.
4. Tap Refresh from iCloud.
5. In the iPhone Files picker, open iCloud Drive > Atlas MTGA > <Profile>.
6. Select Collection.csv, Last_Collection_Changes.csv, and Profile.json (one or more files can be imported; Collection.csv alone is enough for the card browser).
7. Atlas stores the imported data on the iPhone using local browser storage.

Privacy
-------
This v1.0 app is static and has no backend. Imported collection data stays in the browser/PWA storage on the device.
Hosting the app publishes only the app code/assets; your imported MTGA collection is not uploaded by Atlas Companion.

Install requirement
-------------------
An iPhone PWA must be opened from an HTTPS website before it can be installed reliably to the Home Screen.
The files in this folder therefore need to be hosted on a static HTTPS host (GitHub Pages, Cloudflare Pages, Netlify, etc.).
Opening index.html directly from the iPhone Files app is not a replacement for hosting.

Included v1 features
--------------------
- Erin and Kaliyah profiles already created
- Add Profile
- iCloud Files import/refresh
- Collection totals and searchable collection
- Set filter
- Recent collection-change view
- Wildcard tracker
- Deck library and Arena-list paste/copy
- Kaliyah starter deck library entries: Azorius Momo Flyers, Bloomguard Pride, Cloud, Sephiroth
- On-device backup export
- Offline cache after first hosted load

Next step
---------
Host this folder over HTTPS, then open the hosted URL in Safari on the iPhone and choose Share > Add to Home Screen.
