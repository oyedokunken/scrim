import {
  APPIMAGE_PROFILE_COMMANDS,
  APPIMAGE_RUN_COMMANDS,
  APPIMAGE_SANDBOX_COMMANDS,
  spacedFingerprint,
  verifyCommands,
} from '@/lib/linux-help';
import { siteConfig } from '@/site.config';
import styles from './download.module.css';
import { CommandBlock as Commands } from './command-block';

/** The extra steps for an AppImage, under the Linux help. */
export function LinuxAppImageSteps() {
  return (
    <>
      <p>
        <strong>Run the AppImage.</strong> In a terminal, in the folder you downloaded it to:
      </p>
      <Commands lines={APPIMAGE_RUN_COMMANDS} />
      <p>
        <strong>AppImage on Ubuntu 24.04.</strong> If Scrim stops with a sandbox error, Ubuntu is
        blocking the user namespaces that the Chromium sandbox needs. The sandbox stays on. The
        safest fix allows the namespaces for Scrim alone, with the same small AppArmor profile that
        the deb installs. First unpack the AppImage into a fixed folder, because a profile cannot
        name the temporary folder an AppImage normally runs from:
      </p>
      <Commands lines={APPIMAGE_PROFILE_COMMANDS.extract} />
      <p>Then write the profile and load it:</p>
      <Commands lines={[...APPIMAGE_PROFILE_COMMANDS.write, APPIMAGE_PROFILE_COMMANDS.load]} />
      <p>Start Scrim from the unpacked folder:</p>
      <Commands lines={[APPIMAGE_PROFILE_COMMANDS.run]} />
      <p>
        An unpacked copy does not update itself. To update, download the new AppImage and repeat
        these steps. To remove all of it:
      </p>
      <Commands lines={APPIMAGE_PROFILE_COMMANDS.remove} />
      <p>
        <strong>Or, for the whole computer.</strong> This setting is simpler but wider: it lets
        every program create user namespaces, which Ubuntu 24.04 limits on purpose. To allow them
        until you restart:
      </p>
      <Commands lines={[APPIMAGE_SANDBOX_COMMANDS.now]} />
      <p>To keep that setting after a restart:</p>
      <Commands lines={[APPIMAGE_SANDBOX_COMMANDS.keep]} />
      <p>To put the limit back:</p>
      <Commands lines={[APPIMAGE_SANDBOX_COMMANDS.undo]} />
      <p>
        The deb package avoids this: it adds a small AppArmor profile that allows the namespaces for
        Scrim alone.
      </p>
    </>
  );
}

/** How to check a Linux download, under the download button. */
export function LinuxVerify() {
  const fingerprint = spacedFingerprint(siteConfig.linuxSigningFingerprint);
  const [importCommand, verifyCommand] = verifyCommands();
  return (
    <details className={styles.help}>
      <summary>Verify the download</summary>
      <p>
        Every Linux file on the release page has a signature next to it, a file that ends in .asc.
        Download the key and the signature of your file, then run these two commands:
      </p>
      <Commands lines={[importCommand, verifyCommand]} />
      <p>
        <a href={siteConfig.linuxKeyUrl} target="_blank" rel="noopener noreferrer">
          Get the public key
          <span className="visually-hidden"> (opens in a new tab)</span>
        </a>
        . gpg should say Good signature. Replace &lt;file&gt; with the name of the file you
        downloaded.
      </p>
      {fingerprint === '' ? (
        <>
          <p>To read the fingerprint of the key file from the repository, run:</p>
          <Commands lines={['gpg --show-keys --fingerprint scrim-release-key.asc']} />
        </>
      ) : (
        <>
          <p>The key fingerprint is:</p>
          <p>
            <code>{fingerprint}</code>
          </p>
          <p>Check that gpg prints the same fingerprint after the import.</p>
        </>
      )}
    </details>
  );
}
