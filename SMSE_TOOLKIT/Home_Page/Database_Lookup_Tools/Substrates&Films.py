from mp_api.client import MPRester

with MPRester("YOUR_MP_API_KEY") as mpr:
    a = list(input("Enter the Substrate elements    : ").split())
    b = list(input("Enter the Film elements         : ").split())
    sub_ids = [i.material_id for i in mpr.summary.search(elements=a, fields=["material_id"])]
    film_ids = [i.material_id for i in mpr.summary.search(elements=b, fields=["material_id"])]
    print("""
    ===========================================================================================================================
    Area                    : Minimum and maximum volume in Å² to consider for the minimim coincident interface area range.
    Energy                  : Minimum and maximum energy in meV to consider for the elastic energy range.
    Film orientation        : Vector indicating the surface orientation of the film material.
    Substrate formula       : Reduced formula of the substrate material.
    substrate_orientation   : Vector indicating the surface orientation of the substrate material.
    ---------------------------------------------------------------------------------------------------------------------------
    """)
    for i in sub_ids:
        for j in film_ids:
            docs = mpr.substrates.search(all_fields=True, fields=["material_id", "formula_pretty", "band_gap", "energy", "film_id", "orient", "film_orient", "sub_form", "area"], substrate_id=i, film_id=j)
            for k in docs:
                film = mpr.summary.search(material_ids=[k.film_id], fields=["formula_pretty"])
                print("Film formula: ", film[0].formula_pretty)
                print("Substrate formula: ", k.sub_form)
                print("Film orientation: ", k.film_orient)
                print("Area: ", k.area)
                print("Orientation: ", k.orient)
                print("~" * 50)