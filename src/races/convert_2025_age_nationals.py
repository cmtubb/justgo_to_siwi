#!/usr/bin/env python3

import sys
from pathlib import Path
import argparse

from justgo_to_siwi import JustGoToSiwi

script_dir = Path(__file__).resolve().parent

rankings_dir = (script_dir / ".." / ".." / "rankings").resolve()

columns = {"Age"   : 'Age on Event Start Date',
           "Classes": "2026 Canoe Slalom Age Nats - Rescheduled - NGB:Events Entered",
           "Club"   : "2026 Canoe Slalom Age Nats - Rescheduled - NGB:Paddler's Club they are representing (if applicabl",
           "School" :"2026 Canoe Slalom Age Nats - Rescheduled - NGB:Paddler's School they are representing (if applica"}

infile="Attendees_2026_Paddle_Australia_Canoe_Slalom_Age_Nationals_Rescheduled.csv"
rankings = rankings_dir / "icf_rankings_2026-04-03_1614.xlsx"

parser = argparse.ArgumentParser()
parser.add_argument('--example', action="store_true", help="Use the example file")

args = parser.parse_args(sys.argv[1:])

if args.example:
    datadir = (script_dir / ".." / ".." / "examples").resolve()
    infile= "example_age_nationals.csv"
    out_ident = "age_nationals_example"
else:
    datadir = (script_dir / ".." / ".." / "data" / "2025_Age_Nationals").resolve()
    infile = "Attendees_2026_Paddle_Australia_Canoe_Slalom_Age_Nationals_Rescheduled.csv"
    out_ident = "2026_age_nationals"

events = { 
    "K1M": ("Men's K1",(1,80)),
    "C1M": ("Men's C1",(1,80)),
    "K1W": ("Women's K1",(1,80)),
    "C1W": ("Women's C1",(1,80))}

jgs = JustGoToSiwi(datadir,
                   infile,
                   out_ident,
                   events,
                   columns,
                   rankings)


df,df_r,df_siwi = jgs.calculate()

