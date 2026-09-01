from __future__ import annotations

_RAW = """
123456 password 123456789 12345678 12345 1234567 qwerty abc123 111111 123123
1234567890 1234 iloveyou 000000 dragon monkey letmein zaq12wsx trustno1 sunshine
princess qwertyuiop 654321 superman 1qaz2wsx 7777777 121212 000000 qazwsx
123qwe killer master aaaaaa 696969 batman shadow baseball football welcome
login admin passw0rd starwars whatever computer michael jordan jennifer hunter
thomas robert soccer harley ranger buster tigger charlie andrew daniel matthew
joshua summer ashley bailey banana pepper hockey maggie mickey nicole ginger
midnight chelsea diamond yankees jessica pepper1 access flower orange purple
silver samsung amanda nathan cookie hello freedom secret cheese qwerty123
123abc password1 password123 passwordpassword letmein123 admin123 welcome123
root toor guest test test123 demo demo123 changeme change-me default
temp temp123 abcd1234 abcdefgh a1b2c3d4 qwe123 asdfgh asdfghjk zxcvbnm
1q2w3e4r 1q2w3e4r5t q1w2e3r4 1qazxsw2 zaq1zaq1 asdf1234 1234abcd
football1 baseball1 dragon123 monkey123 shadow123 michael1 jordan23
india123 bharat123 mumbai123 delhi123 chennai123 hyderabad123 bangalore123
krishna radhe ganesh shivshiv omnamahshivaya jaimatadi saibaba
hospital hospital123 doctor doctor123 nurse nurse123 patient patient123
clinic clinic123 medical medical123 health health123 pharmacy pharmacy123
apollo123 fortis123 medanta123 aiims123 max123
company123 office123 work123 corp123 staff123 employee123 manager123
summer2024 summer2025 winter2024 winter2025 spring2024 autumn2024
january2024 august2024 december2024 monday123 friday123
p@ssw0rd p@ssword pa55word passw0rd1 password! password@123 password#1
qwerty1234 qwertyuiop123 iloveyou123 letmein1 welcome1 welcome@123
trustno1234 whatever123 sunshine123 princess123 superman123 batman123
football123 baseball123 basketball soccer123 cricket cricket123 sachin123
newpassword newpass123 mypassword mypassword1 secretpassword thisisapassword
keyboardcat letmein2024 letmein2025
admin@123 administrator sysadmin sysadmin123 support support123 helpdesk
backup backup123 database database123 postgres postgres123 mysql123
server123 network123 firewall123 security security123 private123
"""

COMMON_PASSWORDS: frozenset[str] = frozenset(_RAW.split())
