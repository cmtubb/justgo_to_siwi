#!/usr/bin/env python3

import sys
from pathlib import Path
import argparse

from justgo_to_siwi import JustGoToSiwi

script_dir = Path(__file__).resolve().parent

rankings_dir = (script_dir / ".." / ".." / "web" / "public" / "rankings").resolve()

# This export has one column per class, so Classes joins them all
form = "NSW State Champs 2025 - Club:"
columns = {"Age": 'Age on Event Start Date',
           "Classes": [form + "Class",
                       form,
                       form + "MK1",
                       form + "MC1",
                       form + "Labeltext6",
                       form + "Labeltext7",
                       form + "Labeltext8",
                       form + "Labeltext9"],
           "Club": "Organisation",
           "Gender": "Gender",
           "C2Partner": form + "C2 partner"}

rankings = rankings_dir / "2026-2.json"

parser = argparse.ArgumentParser()
parser.add_argument('--example', action="store_true", help="Use the example file")

args = parser.parse_args(sys.argv[1:])

if args.example:
    datadir = (script_dir / ".." / ".." / "examples").resolve()
    infile = "example_state_champs.csv"
    out_ident = "state_champs_example"
else:
    datadir = (script_dir / ".." / ".." / "data" / "2026_NSW_State_Champs").resolve()
    infile = "Attendees_NSW_State_Champs.csv"
    out_ident = "2026_nsw_state_champs"

# K1/C1 Teams are nominated on the day, so they're left unassigned (Summary only).
# C2 boats are paired up by hand from the C2 partner column, so get no bibs here.
events = {
    "K1M": ("^MK1$", (1,80)),
    "C1M": ("^MC1$", (1,80)),
    "K1W": ("^WK1$", (1,80)),
    "C1W": ("^WC1$", (1,80)),
    "CSLX": ("^CSLX", (1,80), {"male": ("MCSLX", (101,180)),
                                "female": ("WCSLX", (201,280))}),
    "C2": ("^C2", (1,80), {"bibs": False})}

jgs = JustGoToSiwi(datadir,
                   infile,
                   out_ident,
                   events,
                   columns,
                   rankings,
                   summary_only=["Gender", "C2Partner"])

df,df_r,df_siwi = jgs.calculate()
