#!/usr/bin/env python3

import re
import sys
import copy
import time
import pandas as pd
import numpy as np
from pathlib import Path
import argparse

script_dir = Path(__file__).resolve().parent
rankings_dir = (script_dir / ".." / ".." / "rankings").resolve()

column_rename = {'Age on Event Start Date': 'Age',
                 "2026 Canoe Slalom Nationals - NGB:Events entered:": 'Classes',
                 "Organisation": 'Club'}

infile="Attendees_2026_Paddle_Australia_Canoe_Slalom_National_Championships.csv"

rankings_file = rankings_dir / "icf_rankings_2026-04-03_1614.xlsx"

parser = argparse.ArgumentParser()
parser.add_argument('--example', action="store_true", help="Use the example file")

args = parser.parse_args(sys.argv[1:])

timestamp=time.strftime('%Y-%m-%d_%H%M')

if args.example:
    datadir = (script_dir / ".." / ".." / "examples").resolve()
    infile= datadir / "example_nationals.csv"
    raceinfo = datadir / f"race_info_nationals_example_{timestamp}.xlsx"
    forsiwi = datadir / f"for_siwi_nationals_example_{timestamp}.csv"
else:
    datadir = (script_dir / ".." / ".." / "data" / "2026_Nationals").resolve()
    infile = datadir / "Attendees_2026_Paddle_Australia_Canoe_Slalom_National_Championships.csv"
    raceinfo = datadir / f"race_info_2026_nationals_{timestamp}.xlsx"
    forsiwi = datadir / f"for_siwi_2026_nationals_{timestamp}.csv"


# Bibs

# WC1 70 - 80 Red
# MC1 1 - 27
# MK1 40 - 76
# WK1 45 - 60 

bibs = { "C1W": (1,80),
         "C1M": (1,80),
         "K1M": (1,80),
         "K1W": (1,80),
         "MCSLX": (1,80),
         "WCSLX": (1,80)}

club_achronym = re.compile("([A-Z])[A-Za-z]+")

df = pd.read_csv(infile, keep_default_na=False)

# Get Kevin in the rate age group :)
df.loc[df['LastName'] == 'Songberg','DOB'] = "01/01/1955"

# Correct, as Georgia entered twice for C1W
"""
df.loc[np.logical_and(np.logical_and(df['LastName'].str.upper()=="O'CALLAGHAN",
                                     df['FirstName'].str.upper()=="GEORGIE"),
                      df["TicketName"]=="additional class"), "Slalom Entry  - Club:Class"] = "WK1"

df.loc[np.logical_and(np.logical_and(df['LastName'].str.upper()=="FOX",
                                     df['FirstName'].str.upper()=="NOEMIE"),
                      df["TicketName"]=="additional class"), "Slalom Entry  - Club:Class"] = "WK1"
"""
                      
regex = re.compile(r" \(CL[0-9]+\)")
df["Regions"] = df["Regions"].apply(lambda x: regex.sub("",x))
df["Organisation"] = df["Organisation"].apply(lambda x: regex.sub("",x))

# Guess a state
for ind in range(df.shape[0]):
    regions = df.loc[ind, "Regions"].split(",")
    
    region = ""
    if len(regions) > 1:
        region = regions[0]
        for r in regions[1:]:
            if r == "New South Wales":
                region = r
    else:
        region=regions[0]    

    df.loc[ind, "Region"] = region


# Guess a club
for ind in range(df.shape[0]):
    clubs = df.loc[ind, "Organisation"].replace(" of NSW Inc","").split(",")
    
    club = ""
    if len(clubs) > 1:

        club = clubs[0]
        
        if "Derwent Canoe Club" in clubs:
            club = "Derwent Canoe Club"
        elif "Big River Canoe Club" in clubs:
            club = "Big River Canoe Club"
        elif "Western Sydney Whitewater Club" in clubs:
            club = "Western Sydney Whitewater Club"
        elif "Melbourne Canoe Club" in clubs:
            club = "Melbourne Canoe Club"
    else:
        club=clubs[0]

    df.loc[ind, "Organisation"] = "".join(club_achronym.findall(club))
    
    
df_r = df[['FirstName', 'LastName', 'DOB', 'Age on Event Start Date', 
           'Region', 'Gender', '2026 Canoe Slalom Nationals - NGB:Events entered:', 'Organisation']]

df_r = df_r.rename(columns=column_rename)


df_r['LastName'] = df_r['LastName'].str.upper()

df_k1m = df_r[df_r['Classes'].str.contains("Men's K1")][["FirstName","LastName","DOB", "Age", "Club"]]
df_k1m["Class"] = "K1M"
df_c1m = df_r[df_r['Classes'].str.contains("Men's C1")][["FirstName","LastName","DOB", "Age", "Club"]]
df_c1m["Class"] = "C1M"
df_k1w = df_r[df_r['Classes'].str.contains("Women's K1")][["FirstName","LastName","DOB", "Age", "Club"]]
df_k1w["Class"] = "K1W"
df_c1w = df_r[df_r['Classes'].str.contains("Women's C1")][["FirstName","LastName","DOB", "Age", "Club"]]
df_c1w["Class"] = "C1W"


df_mcslx = df_r[df_r['Classes'].str.contains("Men's Kayak Cross")][["FirstName","LastName","DOB", "Age", "Club"]]
df_mcslx["Class"] = "MCSLX"
df_wcslx = df_r[df_r['Classes'].str.contains("Women's Kayak Cross")][["FirstName","LastName","DOB", "Age", "Club"]]
df_wcslx["Class"] = "WCSLX"



df_k1m.reset_index(drop=True, inplace=True)
df_k1w.reset_index(drop=True, inplace=True)
df_c1m.reset_index(drop=True, inplace=True)
df_c1w.reset_index(drop=True, inplace=True)
df_mcslx.reset_index(drop=True, inplace=True)
df_wcslx.reset_index(drop=True, inplace=True)


df_siwi = pd.concat( (df_k1m, df_c1m, df_k1w, df_c1w, df_mcslx, df_wcslx), axis=0)
df_siwi.reset_index(drop=True, inplace=True)

rankings = {"K1M": None, "C1M": None, "K1W": None, "C1W": None, "MCSLX": None, "WCSLX": None}

#class_name_conv = { "K1M": "MK1", "C1M": "MC1", "K1W": "WK1", "C1W": "WC1"}

for cl in rankings.keys():
    rankings[cl] = pd.read_excel(rankings_file,
                                 cl, keep_default_na=False)

df_siwi_ranking = copy.deepcopy(df_siwi)
siwi_rankings = []
for index, athlete in df_siwi.iterrows():
    name = f"{athlete['LastName']} {athlete['FirstName']}"
    cl = athlete['Class']

    if name == "O'CALLAGHAN Georgie":
        name = "O'CALLAGHAN Georgia"
    
    selected = rankings[cl]['name'].str.contains(name)

    if selected.any():
        rankname = rankings[cl].loc[selected, 'name'].iloc[0]
        ranking = rankings[cl].loc[selected, 'ranking'].iloc[0]
    else:
        ranking = ""

    siwi_rankings.append(ranking)
        

df_siwi_ranking['Ranking'] = siwi_rankings

df_siwi_ranking = df_siwi_ranking.sort_values(['Class', 'Ranking', 'Age'], ascending=[False,False, True])

df_siwi_ranking = df_siwi_ranking.drop('Age', axis=1)

df_siwi_ranking.reset_index(drop=True, inplace=True)

df_siwi_ranking["Bib"] = 0

for cl in rankings.keys():
    df_cl = df_siwi_ranking[df_siwi_ranking["Class"]==cl]

    assert (bibs[cl][1] - bibs[cl][0]) >= len(df_cl), f"Not enough bibs for '{cl}'"
    
    df_cl.loc[:,"Bib"] = range(bibs[cl][0] + len(df_cl) - 1, bibs[cl][0]-1, -1)

    df_siwi_ranking[df_siwi_ranking["Class"]==cl] = df_cl
    


timestamp=time.strftime('%Y-%m-%d_%H%M')

with pd.ExcelWriter(raceinfo) as writer:  
     df_r.to_excel(writer, sheet_name='Summary', index=False)
     df_siwi_ranking.to_excel(writer, sheet_name='For Siwi with Rankings', index=False)

df_siwi_ranking.to_csv(forsiwi , index=False)

