#!/usr/bin/env python3
"""Store only the deliberately copied Payroom API key in macOS Keychain."""
import getpass, re, subprocess, sys
from_clipboard = '--clipboard' in sys.argv
key = subprocess.check_output(['/usr/bin/pbpaste'], text=True).strip() if from_clipboard else getpass.getpass('KeeperHub API key (hidden): ').strip()
if not re.fullmatch(r'kh_[A-Za-z0-9_-]{20,250}', key):
    raise SystemExit('No valid KeeperHub key was supplied. Nothing stored.')
command = f'add-generic-password -a payroom -s payroom-keeperhub-api-v1 -U -w "{key}"\n'
subprocess.run(['/usr/bin/security','-i'], input=command, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
stored = subprocess.check_output(['/usr/bin/security','find-generic-password','-a','payroom','-s','payroom-keeperhub-api-v1','-w'], text=True, stderr=subprocess.PIPE).strip()
if stored != key: raise SystemExit('Credential-store verification failed.')
if from_clipboard and subprocess.check_output(['/usr/bin/pbpaste'],text=True).strip()==key:
    subprocess.run(['/usr/bin/pbcopy'],input='',text=True,check=True)
print('Payroom API key stored in macOS Keychain. No credential file created.')
