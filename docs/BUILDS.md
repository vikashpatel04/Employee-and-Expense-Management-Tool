# Building the Android apps (Expo / EAS)

Both apps (`apps/fincrew-mobile`, `apps/staffora-mobile`) are built in Expo's cloud (EAS Build).
The owner's Expo account owns the projects; the owner signs in (never typed for them).

## One-time setup (owner)

1. **Install the EAS command-line tool** (once per computer):

   ```bash
   npm install -g eas-cli
   ```

2. **Sign in** with the owner's Expo account (type it yourself in a terminal):

   ```bash
   eas login
   ```

   Check with `eas whoami`.

3. **Link each app to an Expo project** (done 2026-10-26: owner `vikashpatel`, FinCrew
   `e47791a0-…`, Staffora `083b25a1-…` in each `app.json`) (creates the project on expo.dev and writes its id into
   `app.json` → `extra.eas.projectId`; commit that change):

   ```bash
   cd apps/fincrew-mobile && eas init
   cd ../staffora-mobile && eas init
   ```

4. **Android package names are permanent** once an app is on the Play Store. Now they are
   placeholders: `app.fincrew.mobile` and `app.staffora.mobile` (`app.json` → `android.package`).
   Pick the real ones before the first Play Store upload (APK test builds can use these).

5. **Supabase keys for the builds** (the same public values as `.env.local`; the publishable key
   is fine to store, the service-role key never). For each app, for both `preview` and
   `production`:

   ```bash
   eas env:create --environment preview --name EXPO_PUBLIC_SUPABASE_URL --value https://<ref>.supabase.co --visibility plaintext
   eas env:create --environment preview --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value <publishable key> --visibility plaintext
   ```

   (repeat with `--environment production`). `eas.json` profiles read these.

## Building

From the app's folder:

```bash
pnpm build:apk     # preview: an .apk to install directly on phones (internal distribution)
pnpm build:store   # production: an .aab for the Play Store, version code goes up by itself
```

Add `--no-wait` (`pnpm build:apk --no-wait`) to stop once the upload is done: the PC can then be
turned off, and the APK is downloaded later from expo.dev → the project → Builds, on any phone or
computer signed in to the same Expo account.

The build runs on Expo's servers (10–20 min); the link it prints opens the build page with a QR
code / download for the APK. Install it on Android (allow "install from this source").

**If the phone says "invalid package" / "App not installed"**: the APK on Expo is usually fine
(the 29/10/2026 FinCrew APK was checked: complete, signed, all phone types, Android 7 and up).
Check, in order: the download finished (FinCrew is about 96 MB; download again and wait, or
open the build link on the phone and tap Install); an older FinCrew on the phone (uninstall it
first); free storage (needs a few hundred MB); then the exact message and phone model.

**Backup is off** (`"allowBackup": false` in both `app.json`, 2026-10-30): Android used to copy the
app's stored sign-in to Google backup and put it back after a reinstall, so Staffora came back
signed in as the old person. Now uninstalling really forgets the sign-in. A Staffora reinstall
gets a new phone id, so the staff member needs **New phone** on the staff page before signing in
again (same as changing phones).

## Profiles (`eas.json`)

- `base`: Node 22.20.0, pnpm 10.34.7 (the repo's versions).
- `preview`: internal distribution, APK, EAS environment `preview`.
- `production`: app bundle, EAS environment `production`, `autoIncrement` (version code kept by
  EAS, `appVersionSource: remote`).

## Later

- Push notifications need a free Firebase project (Android FCM key uploaded with
  `eas credentials`) — comes with the push notification work.
- Play Store: a Google Play developer account (one-time fee), then `eas submit`.
