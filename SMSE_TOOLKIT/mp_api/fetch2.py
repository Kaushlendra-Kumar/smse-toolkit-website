from mp_api.client import MPRester

with MPRester("YOUR_MP_API_KEY") as mpr:
    #do stuff with mpr...
    docs = mpr.summary.search(elements=["Si", "O"], 
                              band_gap=(0.5, 1.0))
    for i in docs:
        print(i.material_id, i.formula_pretty, i.band_gap)