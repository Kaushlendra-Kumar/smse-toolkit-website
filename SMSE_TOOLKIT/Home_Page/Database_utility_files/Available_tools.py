from mp_api.client import MPRester

with MPRester("YOUR_MP_API_KEY") as mpr:
    #do stuff with mpr...
    l = list(mpr.summary.available_fields)
    for i in l:
        print(i)