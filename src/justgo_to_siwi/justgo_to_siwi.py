import re
import copy
import json
import time
import pandas as pd

from pathlib import Path

class JustGoToSiwi():

    def __init__(self,
                 datadir: Path | str,
                 infile: str,
                 out_ident: Path | str,
                 events : dict[str, tuple],
                 columns : dict[str, str | list[str]],
                 rankings : Path | str,
                 summary_only : list[str] | None = None):
        """`rankings` is a path to one release JSON file from
        `web/public/rankings/` (e.g. `.../2026-2.json`), as produced by
        `src/tools/get_icf_rankings.py`.

        `events` maps a class code to `(search, (bib_start, bib_end))`, with an
        optional third item of options:
          - `"male"` / `"female"`: the class code for male / female entrants,
            optionally with its own bib range, e.g. `"MCSLX"` or
            `("MCSLX", (101, 180))`. Needs a "Gender" column; anyone else keeps
            the class code and range.
          - `"bibs": False`: include the class in Siwi but leave its Bib blank.
        `search` is a regex tested against each "|"-separated Classes value.

        A `columns` value may be a list of headers, whose non-empty values are
        joined with "|" (for exports with one column per class).

        `summary_only` lists mapped fields kept in the Summary but left out of
        the Siwi output (e.g. a C2 partner column)."""
        self.input = (Path(datadir) / infile).resolve()


        self.events = events
        self.columns = columns
        self.out_ident = out_ident
        self.rankings = rankings
        self.summary_only = summary_only or []
        self.warnings: list[str] = []

        self.timestamp=time.strftime('%Y-%m-%d_%H%M')
        self.raceinfo = Path(datadir) / f"race_info_{self.out_ident}_{self.timestamp}.xlsx"
        self.forsiwi = Path(datadir) / f"for_siwi_{self.out_ident}_{self.timestamp}.csv"


    def warn(self, message: str) -> None:
        self.warnings.append(message)
        print(f"Warning: {message}")

    @staticmethod
    def class_values(classes: str) -> list[str]:
        return [v.strip() for v in classes.split("|") if v.strip()]

    @staticmethod
    def normalise_gender(value: str) -> str | None:
        v = value.strip().lower()
        if v in ("male", "m"):
            return "male"
        if v in ("female", "f"):
            return "female"
        return None

    def calculate(self) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:

        self.warnings = []
        column_rename = {value: key for key,value in self.columns.items() if isinstance(value, str)}

        df = pd.read_csv(self.input, keep_default_na=False)

        # Fields mapped to several headers get their non-empty values joined with "|"
        for key, value in self.columns.items():
            if isinstance(value, list):
                df[key] = df[value].astype(str).apply(
                    lambda row: "|".join(v.strip() for v in row if v.strip()), axis=1)

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
            [key for key in self.columns.keys() if key != "Classes" and key not in self.summary_only]

        has_gender = "Gender" in self.columns
        class_values = df_r['Classes'].apply(self.class_values)
        # Class value -> codes of the classes that matched it
        value_matches = {v: {} for values in class_values for v in values}

        class_df = []
        # Bib range for each Siwi class code (None: no bibs), first class to produce it wins
        bib_ranges = {}
        for cl, (search_name, bibs, *rest) in self.events.items():
            options = rest[0] if rest else {}
            # Gender -> (code, bib range); a bare code shares the class's range
            splits = {g: (s, bibs) if isinstance(s, str) else s
                      for g in ("male", "female") if (s := options.get(g))}
            no_bibs = options.get("bibs") is False

            hits = class_values.apply(lambda values: [v for v in values if re.search(search_name, v)])
            matched = list(dict.fromkeys(v for vs in hits for v in vs))
            for v in matched:
                value_matches[v][cl] = None
            if len(matched) > 1:
                self.warn(f"Search '{search_name}' (class {cl}) matched {len(matched)} different values: "
                          f"{', '.join(repr(v) for v in matched)}. If that's not intended, make it more "
                          "specific, e.g. anchor it with '^'.")

            df_cl = df_r[hits.apply(bool)].copy()
            codes = []
            for gender in (df_cl['Gender'] if has_gender else [""] * len(df_cl)):
                g = self.normalise_gender(gender) if has_gender else None
                code, code_bibs = splits.get(g, (cl, bibs))
                codes.append(code)
                bib_ranges.setdefault(code, None if no_bibs else code_bibs)
            df_cl = df_cl[column_names].copy()
            df_cl["Class"] = codes
            df_cl.reset_index(drop=True, inplace=True)
            class_df.append(df_cl)

            if splits and not has_gender:
                self.warn(f"Class {cl} has male/female codes but no 'Gender' column is mapped, "
                          f"so its entrants were kept as {cl}.")
            elif splits and codes.count(cl) > 0:
                self.warn(f"{codes.count(cl)} {cl} entrant(s) had no recognised Gender and were kept as {cl}.")

        for v, codes in value_matches.items():
            if len(codes) > 1:
                self.warn(f"Class value '{v}' matched several classes: {', '.join(repr(c) for c in codes)}.")
        counts = {v: sum(v in values for values in class_values) for v in value_matches}
        unassigned = [f"'{v}' ({counts[v]})" for v, codes in value_matches.items() if not codes]
        if unassigned:
            self.warn(f"Not assigned to any class (still listed in the Summary): {', '.join(unassigned)}.")

        df_siwi = pd.concat( class_df, axis=0)
        df_siwi.reset_index(drop=True, inplace=True)

        with open(self.rankings, encoding="utf-8") as f:
            release = json.load(f)

        rankings = {}
        missing = []
        for cl in bib_ranges.keys():
            entries = release["classes"].get(cl)
            if entries is None:
                missing.append(cl)
                entries = []
            rankings[cl] = pd.DataFrame(entries, columns=["name", "ranking"])
        if missing:
            self.warn(f"No ranking data for: {', '.join(missing)} in {self.rankings}. "
                      "Those entries were left unranked.")

        df_siwi_ranking = copy.deepcopy(df_siwi)
        siwi_ranking = []
        siwi_is_ranked = []
        siwi_ranking_value = []
        for index, athlete in df_siwi.iterrows():
            name = f"{athlete['LastName']} {athlete['FirstName']}"
            cl = athlete['Class']

            if name == "O'CALLAGHAN Georgie":
                name = "O'CALLAGHAN Georgia"

            selected = rankings[cl]['name'].str.contains(name)

            if selected.any():
                ranking = int(rankings[cl].loc[selected, 'ranking'].iloc[0])
                siwi_ranking.append(ranking)
                siwi_is_ranked.append(True)
                siwi_ranking_value.append(ranking)
            else:
                siwi_ranking.append("")
                siwi_is_ranked.append(False)
                # Placeholder: only compared within the unranked group, where
                # every row shares it, so it never affects ordering there.
                siwi_ranking_value.append(0)

        df_siwi_ranking['Ranking'] = siwi_ranking

        # Sort unranked entries before ranked ones (they get the highest
        # bibs), then ranked entries by ranking value descending; Age breaks
        # ties in both groups. Sorting on explicit `_is_ranked`/`_ranking_value`
        # columns avoids mixing int and "" in one column, which pandas
        # compares unpredictably.
        df_siwi_ranking['_is_ranked'] = siwi_is_ranked
        df_siwi_ranking['_ranking_value'] = siwi_ranking_value
        df_siwi_ranking = df_siwi_ranking.sort_values(
            ['Class', '_is_ranked', '_ranking_value', 'Age'],
            ascending=[False, True, False, True],
        )
        df_siwi_ranking = df_siwi_ranking.drop(columns=['Age', '_is_ranked', '_ranking_value'])
        df_siwi_ranking.reset_index(drop=True, inplace=True)

        df_siwi_ranking["Bib"] = 0
        for cl in rankings.keys():
            if bib_ranges[cl] is None:
                continue
            df_cl = df_siwi_ranking[df_siwi_ranking["Class"]==cl]
            bib_start, bib_end = bib_ranges[cl]
            assert (bib_end - bib_start) >= len(df_cl), f"Not enough bibs for '{cl}'"
            df_cl.loc[:,"Bib"] = range(bib_start + len(df_cl) - 1, bib_start - 1, -1)
            df_siwi_ranking[df_siwi_ranking["Class"]==cl] = df_cl

        # Classes without bibs keep a blank Bib
        no_bibs = df_siwi_ranking["Class"].isin([cl for cl, r in bib_ranges.items() if r is None])
        if no_bibs.any():
            df_siwi_ranking["Bib"] = df_siwi_ranking["Bib"].astype(object)
            df_siwi_ranking.loc[no_bibs, "Bib"] = ""

        with pd.ExcelWriter(self.raceinfo) as writer:  
            df_r.to_excel(writer, sheet_name='Summary', index=False)
            df_siwi_ranking.to_excel(writer, sheet_name='For Siwi with Rankings', index=False)

        df_siwi_ranking.to_csv(self.forsiwi , index=False)

        return df, df_r, df_siwi_ranking