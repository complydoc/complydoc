# Choose what is looked for

complydoc looks for about forty kinds of identifier: bank details, tax numbers from a
dozen countries, names, addresses, and more. Not all of them matter to every folder. A
UK insurer has no use for US ZIP codes, and a team that finds organisation names noisy may
want them called less serious. The categories file changes this without copying
complydoc's settings.

```yaml title=".complydoc-categories.yaml"
schema_version: 1
categories:
  us_zip_code:
    enabled: false
  organisation_name:
    severity: low
```

Only what differs from complydoc's own settings is written. A category left out of the
file is looked for as it ships, so the file doesn't drift from the defaults as they change.

| Field | Meaning |
| --- | --- |
| `enabled` | `false` stops the category being looked for at all. |
| `severity` | `low`, `medium` or `high`: how serious a finding of the category is called. The policy, `complydoc check` and the report's counts follow it. |

An audit reads `.complydoc-categories.yaml` at the top of the folder it audits, or the
file `--categories` names. A pipeline observed with `cd.observe` takes its categories
from the `config` it is given.

## What the report says

A category that is switched off finds nothing, which reads the same as a clean one. So
the report says it was not looked for:

- the limitations list "Categories switched off", and the Security page names them above
  the findings, beside any category that couldn't run for another reason, such as a
  missing name model
- the `categories` section of the JSON lists each change with the shipped setting beside it

A name in the file that is no category, from a typo say, changes nothing and doesn't stop
the run. The report names it.

## Change it in the viewer

Under `complydoc ui`, the Settings page lists every category with a box to switch it off,
its severity, and a button to put it back as shipped. A category changed from its default
is marked. The file is the one the command line reads; changes apply from the next run. A
report opened any other way shows what its run changed, read only.

## A category switched off is not masked

Masking is done by the same scan that finds identifiers, so a category that isn't looked for
isn't masked either. A value of it shows in the report's page text as it is written in the
document. Switch a category off only where the report doesn't leave your hands, or where
that value is not sensitive to you.

## What this doesn't do

- Shipped categories can't be deleted or have their patterns edited here. Switch one off,
  and add [your own concept](custom-concepts.md) for what you want instead.
- Concepts are in their own file and have their own severity.
