#!/usr/bin/env python3

from pprint import pprint
from selenium import webdriver 
from selenium.webdriver import FirefoxOptions
from pathlib import Path

script_dir = Path(__file__).resolve().parent
rankings_dir = (script_dir / ".." / ".." / "rankings").resolve()

import time 

import pandas as pd

from bs4 import BeautifulSoup

from selenium.webdriver.support.wait import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.by import By
from selenium.webdriver.support.select import Select

# selenium firefox browser options
options = FirefoxOptions()
options.add_argument("-headless")


bigsoup = {}

# initiating the browser and download the webdriver
#if True:
with webdriver.Firefox(options=options) as driver:
    #driver =  webdriver.Firefox(options=options)
    # go to the target web page
    #driver.get("https://www.canoeicf.com/icf-canoe-slalom-world-ranking")
    driver.get("https://www.siwidata.com/ICFWorldRanking.aspx")
    
    wait = WebDriverWait(driver, timeout=5)
    
    #pprint(driver.page_source)

    select_element = driver.find_element(By.NAME, "ddlRelease");
    select_rel = Select(select_element)

    options = [option.text for option in select_rel.options]
    print("release options: " + ",".join(options))
    
    select_element = driver.find_element(By.NAME, "ddlClass");
    select = Select(select_element);

    options = [option.text for option in select.options]
    print("class options: " + ",".join(options))

    for option in options:

        if option in ["K1M", "K1W", "C1W", "C1M", "WCSLX", "MCSLX"]:

            if option in ["K1M", "K1W", "C1W", "C1M"]:
                release="2026-1"
            else:
                release="2026-1-X"
                
            select_element = driver.find_element(By.NAME, "ddlRelease");
            select_rel = Select(select_element)

            print(release)
            select_rel.select_by_value(release)
            time.sleep(10) # Better to use wait???
            
            select_element = driver.find_element(By.NAME, "ddlClass");
            select = Select(select_element);
            
            print(option)
            select.select_by_value(option)
            time.sleep(5) # Better to use wait???
    
            bigsoup[option] = BeautifulSoup(driver.page_source,'html5lib')


    #with open("icf_rankings_siwi.html", "wt") as f:
    #    f.write(driver.page_source)

    #driver.save_screenshot('siwi_rankings.png')


rankings = {}
          

for cl,soup in bigsoup.items():

    rankings[cl] = {"name": [], "ranking" : []}
    table = soup.find("table", { "id" : "tblRanking" })
    for row in table.findAll("tr")[1:]:
        cells = row.findAll("td")

        rankings[cl]['name'].append(cells[1].text)
        rankings[cl]['ranking'].append(cells[0].text)

    rankings[cl] = pd.DataFrame(rankings[cl])


with pd.ExcelWriter(rankings_dir / f'icf_rankings_{time.strftime('%Y-%m-%d_%H%M')}.xlsx') as writer:
    for cl,df in rankings.items():
        df.to_excel(writer, sheet_name=cl, index=False)

