from mp_api.client import MPRester

with MPRester("YOUR_MP_API_KEY") as mpr:
    elements = list(input("Enter the elements: ").split())
    docs = mpr.summary.search(elements=elements, fields=["material_id"])
    ret = []
    for i in docs:
        d = mpr.alloys.search(material_ids=i.material_id, fields=["alloy_pair"])
        for y in d:
            ret.append(y.alloy_pair)
        ret.append("~~~~~~~~~~~~~~~~~~~~~")
    for k in ret:
        print(k)