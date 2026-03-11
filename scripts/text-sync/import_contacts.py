"""Import Apple Contacts into a lookup table for phone→name resolution.

Uses AppleScript to read contacts since it has reliable access on modern macOS.
Builds a phone_number → {name, apple_id, phones, birthday} lookup.
"""
import json
import subprocess
import sys
from phone_utils import normalize_phone


def fetch_apple_contacts() -> list[dict]:
    """Fetch all contacts from Apple Contacts via AppleScript.

    Returns list of {name, phones: [str], birthday: str|None, emails: [str], addresses: [str]}
    """
    # AppleScript to extract contacts with phones
    script = '''
    tell application "Contacts"
        activate
        set output to ""
        set allPeople to every person
        repeat with p in allPeople
            set pName to ""
            try
                set pName to (first name of p & " " & last name of p)
            on error
                try
                    set pName to (first name of p)
                on error
                    try
                        set pName to (last name of p)
                    on error
                        set pName to ""
                    end try
                end try
            end try

            if pName is not "" then
                set phoneList to ""
                try
                    repeat with ph in (every phone of p)
                        set phoneList to phoneList & (value of ph) & ";"
                    end repeat
                end try

                if phoneList is not "" then
                    set emailList to ""
                    try
                        repeat with em in (every email of p)
                            set emailList to emailList & (value of em) & ";"
                        end repeat
                    end try

                    set bday to ""
                    try
                        set bday to (birth date of p as string)
                    end try

                    set addrList to ""
                    try
                        repeat with addr in (every address of p)
                            set addrList to addrList & (formatted address of addr) & "||"
                        end repeat
                    end try

                    set output to output & pName & "\\t" & phoneList & "\\t" & emailList & "\\t" & bday & "\\t" & addrList & "\\n"
                end if
            end if
        end repeat
        return output
    end tell
    '''

    result = subprocess.run(
        ["osascript", "-e", script],
        capture_output=True, text=True, timeout=600
    )

    if result.returncode != 0:
        print(f"[import_contacts] AppleScript error: {result.stderr}", file=sys.stderr)
        return []

    contacts = []
    for line in result.stdout.strip().split("\n"):
        if not line.strip():
            continue

        parts = line.split("\t")
        if len(parts) < 2:
            continue

        name = parts[0].strip()
        raw_phones = parts[1].rstrip(";").split(";") if len(parts) > 1 else []
        raw_emails = parts[2].rstrip(";").split(";") if len(parts) > 2 else []
        birthday = parts[3].strip() if len(parts) > 3 else None
        raw_addresses = parts[4].rstrip("||").split("||") if len(parts) > 4 else []

        phones = []
        for rp in raw_phones:
            rp = rp.strip()
            if rp:
                normalized = normalize_phone(rp)
                if normalized:
                    phones.append(normalized)

        if phones:
            contacts.append({
                "name": name,
                "phones": phones,
                "emails": [e.strip() for e in raw_emails if e.strip()],
                "birthday": birthday if birthday else None,
                "addresses": [a.strip() for a in raw_addresses if a.strip()],
            })

    return contacts


def build_phone_lookup(contacts: list[dict]) -> dict[str, dict]:
    """Build phone_number → contact info lookup from Apple Contacts.

    Returns dict: {normalized_phone: {name, phones, birthday, emails, addresses}}
    """
    lookup = {}
    for c in contacts:
        for phone in c["phones"]:
            lookup[phone] = c
    return lookup


def main():
    """Run standalone to test contact import."""
    contacts = fetch_apple_contacts()
    print(f"[import_contacts] Fetched {len(contacts)} contacts with phone numbers")

    lookup = build_phone_lookup(contacts)
    print(f"[import_contacts] Built lookup with {len(lookup)} phone numbers")

    # Show sample
    for phone, info in list(lookup.items())[:5]:
        print(f"  {phone} → {info['name']}")

    # Save to JSON for debugging
    with open("/tmp/apple_contacts_lookup.json", "w") as f:
        json.dump(lookup, f, indent=2)
    print(f"[import_contacts] Saved lookup to /tmp/apple_contacts_lookup.json")


if __name__ == "__main__":
    main()
