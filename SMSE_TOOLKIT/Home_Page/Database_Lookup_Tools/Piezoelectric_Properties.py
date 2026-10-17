from mp_api.client import MPRester

with MPRester("YOUR_MP_API_KEY") as mpr:
    """
    material_ids (str, List[str]): A single Material ID string or list of strings
        (e.g., mp-149, [mp-149, mp-13]).
    piezoelectric_modulus (Tuple[float,float]): Minimum and maximum of the
        piezoelectric modulus in C/m² to consider.
    sort_fields (List[str]): Fields used to sort results. Prefix with '-' to sort in descending order.
    num_chunks (int): Maximum number of chunks of data to yield. None will yield all possible.
    chunk_size (int): Number of data entries per chunk.
    all_fields (bool): Whether to return all fields in the document. Defaults to True.
    fields (List[str]): List of fields in PiezoDoc to return data for.
        Default is material_id and last_updated if all_fields is False.

    """
    a = list(map(str, input("Enter the elements : ").split()))
    materials = mpr.summary.search(elements=a, fields=["material_id"])

    material_ids = []
    for i in materials:
        material_ids.append(i.material_id)
    piezoelectric_modulus = (float(input("Enter the minimum piezoelectric modulus : ") or float('-inf')), float(input("Enter the maximum piezoelectric modulus : ") or float('inf')))
    # sort_fields = list(map(str, input("Enter the sort fields : ").split()))
    num_chunks = int(input("Enter the number of chunks : ") or 100000)
    chunk_size = int(input("Enter the chunk size : ") or 1000)

    piezoelectric = mpr.piezoelectric.search(material_ids=material_ids, piezoelectric_modulus=piezoelectric_modulus, num_chunks=num_chunks, chunk_size=chunk_size, all_fields=True)

    for i in piezoelectric:
        print("Formula : ", i.formula_pretty)
        print("Material ID : ", i.material_id)
        print("Total piezoelectric tensor : ", i.total)
        print("Total ionic contribution to piezoelectric tensor C/m²: ", i.ionic)
        print("Total electronic contribution to piezoelectric tensor C/m²: ", i.electronic)
        print("Total piezoelectric modulus : ", i.e_ij_max)
        print("Miller direction for maximum piezo response : ", i.max_direction)
        print("Normalized strain direction for maximum piezo repsonse : ", i.strain_for_max)
        print("~"*100)
