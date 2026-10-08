#!/bin/bash
# Radio Tower — paste this whole file into Oracle's "Initialization script"
# box when you create the server (Advanced options → Management → Paste
# cloud-init script). It runs once, as root, on the server's first boot, and
# installs everything: deploy/cloud/install.sh.
#
# The station key is the password the library bot and the DJ booth use.
# Leave the placeholder and the server makes a random one on first boot
# (then: ssh in, `sudo cat /srv/radio/TOWER.txt`) — the safer way, since
# nothing secret is pasted into Oracle. Or put your own (long, random) here.
# Either way, keep it out of GitHub.
export TOWER_KEY='PUT-A-LONG-RANDOM-KEY-HERE'
export TOWER_REPO='https://github.com/TurnOposite/World-wide-web.git'
export TOWER_BRANCH='main'
# export TOWER_HOST='radio.example.com'   # only if you have your own domain pointed here

curl -fsSL "https://raw.githubusercontent.com/TurnOposite/World-wide-web/${TOWER_BRANCH}/deploy/cloud/install.sh" -o /root/radio-tower-install.sh
bash /root/radio-tower-install.sh > /var/log/radio-tower-install.log 2>&1
