#!/usr/bin/env python3

from pathlib import Path
from justgo_to_siwi import JustGoToSiwi

script_dir = Path(__file__).resolve().parent

rankings_dir = (script_dir / ".." / ".." / "web" / "public" / "rankings").resolve()

columns= {"Age": 'Age on Event Start Date',
          'Classes' : "Slalom Entry  - Club:Class",
          'Club' : "Organisation"}

datadir = (script_dir / ".." / ".." / "data" / "2026_may_v2_wswc_club_race").resolve()
infile="Attendees_Club_Race_May_2026.csv"

events = { 
    "K1M": ("MK1",(1,80)),
    "C1M": ("MC1",(1,80)),
    "K1W": ("WK1",(1,80)),
    "C1W": ("WC1",(1,80))}

jgs = JustGoToSiwi(datadir,
                   infile,
                   "2026_may_v2_wswc_club_race",
                   events,
                   columns,
                   rankings_dir / "2026-1.json")

df,df_r,df_siwi = jgs.calculate()