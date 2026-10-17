from mp_api.client import MPRester

with MPRester("YOUR_MP_API_KEY") as mpr:
    a = list(input("Enter the elements: ").split())
    docs = mpr.summary.search(elements=a, fields=["material_id", "formula_pretty", "density", "density_atomic"])
    for i in docs:
        print("Material ID = ", i.material_id, "Formula = ", i.formula_pretty, "Density = ", i.density, "Atomic Density = ", i.density_atomic)
        print("~" * 50)
