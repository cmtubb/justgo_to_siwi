import re
import copy
import time
import pandas as pd

from pathlib import Path

class JustGoToSiwi():

    def __init__(self,
                 datadir: Path | str,
                 infile: str,
                 out_ident: Path | str,
                 events : dict[str, tuple[str, tuple[int,int]]],
                 columns : dict[str,str],
                 rankings : Path | str):
        self.input = (Path(datadir) / infile).resolve()


        self.events = events
        self.columns = columns
        self.out_ident = out_ident
        self.rankings = rankings

        self.timestamp=time.strftime('%Y-%m-%d_%H%M')
        self.raceinfo = Path(datadir) / f"race_info_{self.out_ident}_{self.timestamp}.xlsx"
        self.forsiwi = Path(datadir) / f"for_siwi_{self.out_ident}_{self.timestamp}.csv"


    def calculate(self) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:

        column_rename = {value: key for key,value in self.columns.items()}

        df = pd.read_csv(self.input, keep_default_na=False)

        if "Age" in self.columns.keys() and "Age" in df.keys():
            if self.columns["Age"] != "Age":
                df = df.drop(columns=["Age"])

        df = df.rename(columns=column_rename)

        # Get Kevin in the right age group :)
        df.loc[df['LastName'] == 'Songberg','DOB'] = "01/01/1955"

        regex = re.compile(r" \(CL[0-9]+\)")
        if "Club" in self.columns.keys() and self.columns["Club"] == 'Organisation':
            df["Club"] = df["Club"].apply(lambda x: regex.sub("",x))
            club_achronym = re.compile("([A-Z])[A-Za-z]+")

            # Guess a club
            for ind in range(df.shape[0]):
                clubs = df.loc[ind, "Club"].replace(" of NSW Inc","").split(",")
                
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

                df.loc[ind, "Club"] = "".join(club_achronym.findall(club))

        
        if "Regions" in df.keys():
            df["Regions"] = df["Regions"].apply(lambda x: regex.sub("",x))
               
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

        column_names = ['FirstName', 'LastName', 'DOB'] 
        if "Region" in df.keys():
            column_names.append('Region')
        column_names += [key for key in self.columns.keys()]

        df_r = df[column_names].copy()

        df_r['LastName'] = df_r['LastName'].str.upper()

        column_names = ["FirstName","LastName","DOB"] +\
            [key for key in self.columns.keys() if key != "Classes"]

        class_df = []
        for cl, (search_name, _) in self.events.items():
            df_cl = df_r[df_r['Classes'].str.contains(search_name)][column_names].copy()
            df_cl["Class"] = cl
            df_cl.reset_index(drop=True, inplace=True)
            class_df.append(df_cl)
        
        df_siwi = pd.concat( class_df, axis=0)
        df_siwi.reset_index(drop=True, inplace=True)

        rankings = {key: None for key in self.events.keys()}
        for cl in rankings.keys():
            rankings[cl] = pd.read_excel(self.rankings,
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
            assert (self.events[cl][1][1] - self.events[cl][1][0]) >= len(df_cl), f"Not enough bibs for '{cl}'"
            df_cl.loc[:,"Bib"] = range(self.events[cl][1][0] + len(df_cl) - 1, self.events[cl][1][0]-1, -1)
            df_siwi_ranking[df_siwi_ranking["Class"]==cl] = df_cl

        with pd.ExcelWriter(self.raceinfo) as writer:  
            df_r.to_excel(writer, sheet_name='Summary', index=False)
            df_siwi_ranking.to_excel(writer, sheet_name='For Siwi with Rankings', index=False)

        df_siwi_ranking.to_csv(self.forsiwi , index=False)

        return df, df_r, df_siwi_ranking