from mp_api.client import MPRester

with MPRester("YOUR_MP_API_KEY") as mpr:
    """
    material_ids (str, List[str]): A single Material ID string or list of strings
        (e.g., mp-149, [mp-149, mp-13]).
    num_magnetic_sites (Tuple[int,int]): Minimum and maximum number of magnetic sites to consider.
    num_unique_magnetic_sites (Tuple[int,int]): Minimum and maximum number of unique magnetic sites
        to consider.
    ordering (Ordering]): The magnetic ordering of the material.
    total_magnetization (Tuple[float,float]): Minimum and maximum total magnetization values to consider.
    total_magnetization_normalized_vol (Tuple[float,float]): Minimum and maximum total magnetization values normalized by volume to consider.
    total_magnetization_normalized_formula_units (Tuple[float,float]): Minimum and maximum total magnetization
        values normalized by formula units to consider.
    sort_fields (List[str]): Fields used to sort results. Prefix with '-' to sort in descending order.
    num_chunks (int): Maximum number of chunks of data to yield. None will yield all possible.
    chunk_size (int): Number of data entries per chunk.
    all_fields (bool): Whether to return all fields in the document. Defaults to True.
    fields (List[str]): List of fields in MagnetismDoc to return data for.
        Default is material_id and last_updated if all_fields is False.

    """
    a = list(map(str, input("Enter the elements : ").split()))
    materials = mpr.summary.search(elements=a, fields=["material_id"])

    material_ids = []
    for i in materials:
        material_ids.append(i.material_id)
    num_magnetic_sites = (int(input("Enter the minimum number of magnetic sites : ") or 0 ), int(input("Enter the maximum number of magnetic sites : ") or 1000000))
    num_unique_magnetic_sites = (int(input("Enter the minimum number of unique magnetic sites : ") or 0), int(input("Enter the maximum number of unique magnetic sites : ") or 10000000))
    ordering = input("Enter the magnetic ordering of the material : ")
    total_magnetization = (float(input("Enter the minimum total magnetization : ") or float('-inf')), float(input("Enter the maximum total magnetization : ") or float('inf')))
    total_magnetization_normalized_vol = (float(input("Enter the minimum total magnetization normalized by volume : ") or float('-inf')), float(input("Enter the maximum total magnetization normalized by volume : ") or float('inf')))
    total_magnetization_normalized_formula_units = (float(input("Enter the minimum total magnetization normalized by formula units : ") or float('-inf')), float(input("Enter the maximum total magnetization normalized by formula units : ") or float('inf')))
    # sort_fields = input("Enter the fields used to sort results : ")
    # num_chunks = int(input("Enter the maximum number of chunks of data to yield : "))
    # chunk_size = int(input("Enter the number of data entries per chunk : "))
    # all_fields = input("Enter whether to return all fields in the document : ")
    # fields = input("Enter the fields in MagnetismDoc to return data for : ")

    materials = mpr.magnetism.search(material_ids=material_ids, num_magnetic_sites=num_magnetic_sites, num_unique_magnetic_sites=num_unique_magnetic_sites, ordering=ordering, total_magnetization=total_magnetization, total_magnetization_normalized_vol=total_magnetization_normalized_vol, total_magnetization_normalized_formula_units=total_magnetization_normalized_formula_units, all_fields=True)

    for i in materials:
        print("Formula = ", i.formula_pretty)
        print("Magnetic ordering = ", i.ordering)
        print("Is magnetic = ", i.is_magnetic)
        print("Total magnetization in μB = ", i.total_magnetization)
        print("Total magnetization normalized by volume in μB/Å³ = ", i.total_magnetization_normalized_vol)
        print("Total magnetization normalized by formula units in μB/f.u. = ", i.total_magnetization_normalized_formula_units)
        print("Number of magnetic sites = ", i.num_magnetic_sites)
        print("Number of unique magnetic sites = ", i.num_unique_magnetic_sites)
        print("Exchange symmetry = ", i.exchange_symmetry)
        print("Magnetic species elements = ", i.types_of_magnetic_species)
        print("Magnetic moments for each sites = ", i.magmoms)
        print("============================================="*2)

