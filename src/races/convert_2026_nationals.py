#!/usr/bin/env python3

import sys
from pathlib import Path
import argparse

script_dir = Path(__file__).resolve().parent

jg_to_siwi = script_dir.parent / "justgo_to_siwi"

if jg_to_siwi not in sys.path:
    sys.path.append(str(jg_to_siwi))
from justgo_to_siwi import JustGoToSiwi

rankings_dir = (script_dir / ".." / ".." / "rankings").resolve()

columns= {"Age": 'Age on Event Start Date',
          'Classes' : "2026 Canoe Slalom Nationals - NGB:Events entered:",
          'Club' : "Organisation"}

infile="Attendees_2026_Paddle_Australia_Canoe_Slalom_National_Championships.csv"

rankings = rankings_dir / "icf_rankings_2026-04-03_1614.xlsx"

parser = argparse.ArgumentParser()
parser.add_argument('--example', action="store_true", help="Use the example file")

args = parser.parse_args(sys.argv[1:])

if args.example:
    datadir = (script_dir / ".." / ".." / "examples").resolve()
    infile= "example_nationals.csv"
    out_ident ="nationals_example"
else:
    datadir = (script_dir / ".." / ".." / "data" / "2026_Nationals").resolve()
    infile = "Attendees_2026_Paddle_Australia_Canoe_Slalom_National_Championships.csv"
    out_ident = "2026_nationals"


events = { 
    "K1M": ("Men's K1",(1,80)),
    "C1M": ("Men's C1",(1,80)),
    "K1W": ("Women's K1",(1,80)),
    "C1W": ("Women's C1",(1,80)),           
    "MCSLX": ("Men's Kayak Cross",(1,80)),
    "WCSLX": ("Women's Kayak Cross", (1,80))}

jgs = JustGoToSiwi(datadir,
                   infile,
                   out_ident,
                   events,
                   columns,
                   rankings)

df,df_r,df_siwi = jgs.calculate()

