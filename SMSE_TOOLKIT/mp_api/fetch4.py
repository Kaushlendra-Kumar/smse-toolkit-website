from mp_api.client import MPRester

with MPRester("YOUR_MP_API_KEY") as mpr:
    #do stuff with mpr...
    print(mpr.summary.available_fields)
    # a = list(input("Enter the elements: ").split())
    b = list(map(float, input("Enter the band gap: ").split()))
    docs = mpr.summary.search(band_gap=b, fields=["material_id", "formula_pretty", "band_gap"])
    for i in docs:
        if i.band_gap > 0:
            print(i.material_id, i.formula_pretty, i.band_gap)
