from mp_api.client import MPRester
with MPRester("YOUR_MP_API_KEY") as mpr:
    a = list(input("Enter the elements: ").split())
    ids = mpr.summary.search(elements=a, fields=["material_id"])
    ret = []
    for i in ids:
        docs = mpr.materials.get_structure_by_material_id(i.material_id)
        ret.append(docs)
        print(docs)
        print("~" * 50)
        print("~" * 50)
    # for docs in ret:
        