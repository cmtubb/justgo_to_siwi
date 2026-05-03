#!/usr/bin/env python3

from pathlib import Path
from justgo_to_siwi import JustGoToSiwi

script_dir = Path(__file__).resolve().parent

rankings_dir = (script_dir / ".." / ".." / "rankings").resolve()

columns= {"Age": 'Age on Event Start Date',
          'Classes' : "Slalom Entry  - Club:Class",
          'Club' : "Organisation"}

datadir = (script_dir / ".." / ".." / "data" / "2026_May_WSWC_Club_Race").resolve()
infile="Attendees_Club_Race_May_.csv"

events = { 
    "K1M": ("MK1",(1,80)),
    "C1M": ("MC1",(1,80)),
    "K1W": ("WK1",(1,80)),
    "C1W": ("WC1",(1,80))}

jgs = JustGoToSiwi(datadir,
                   infile,
                   "2026_may_wswc_club_race",
                   events,
                   columns,
                   rankings_dir / "icf_rankings_2026-04-03_1614.xlsx")

df,df_r,df_siwi = jgs.calculate()