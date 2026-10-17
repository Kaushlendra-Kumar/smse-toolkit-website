from mp_api.client import MPRester

with MPRester("YOUR_MP_API_KEY") as mpr:
    #do stuff with mpr...
    docs = mpr.summary.search(material_ids=["mp-149", "mp-13", "mp-22526"])
    example_doc = docs[0]

    mpid = example_doc.material_id
    formula = example_doc.formula_pretty

    print(mpid)
    print(formula)
    list_of_available_fields = mpr.summary.available_fields
    print(list_of_available_fields)
