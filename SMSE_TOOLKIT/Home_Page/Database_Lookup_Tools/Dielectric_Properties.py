from mp_api.client import MPRester

with MPRester("YOUR_MP_API_KEY") as mpr:
    """
    material_ids (str, List[str]): A single Material ID string or list of strings
        (e.g., mp-149, [mp-149, mp-13]).
    e_total (Tuple[float,float]): Minimum and maximum total dielectric constant to consider.
    e_ionic (Tuple[float,float]): Minimum and maximum ionic dielectric constant to consider.
    e_electronic (Tuple[float,float]): Minimum and maximum electronic dielectric constant to consider.
    n (Tuple[float,float]): Minimum and maximum refractive index to consider.
    sort_fields (List[str]): Fields used to sort results. Prefix with '-' to sort in descending order.
    num_chunks (int): Maximum number of chunks of data to yield. None will yield all possible.
    chunk_size (int): Number of data entries per chunk.
    all_fields (bool): Whether to return all fields in the document. Defaults to True.
    fields (List[str]): List of fields in DielectricDoc to return data for.
        Default is material_id and last_updated if all_fields is False.

    """
    a = list(map(str, input("Enter the elements : ").split()))
    materials = mpr.summary.search(elements=a, fields=["material_id"])

    material_ids = []
    for i in materials:
        material_ids.append(i.material_id)
    e_total = (float(input("Enter the minimum total dielectric constant : ") or float('-inf')), float(input("Enter the maximum total dielectric constant : ") or float('inf')))
    e_ionic = (float(input("Enter the minimum ionic dielectric constant : ") or float('-inf')), float(input("Enter the maximum ionic dielectric constant : ") or float('inf')))
    e_electronic = (float(input("Enter the minimum electronic dielectric constant : ") or float('-inf')), float(input("Enter the maximum electronic dielectric constant : ") or float('inf')))
    n = (float(input("Enter the minimum refractive index : ") or float('-inf')), float(input("Enter the maximum refractive index : ") or float('inf')))
    # sort_fields = list(map(str, input("Enter the fields to sort results : ").split()))
    num_chunks = int(input("Enter the maximum number of chunks of data to yield : ") or 1000)
    chunk_size = int(input("Enter the number of data entries per chunk : ") or 100)
    # all_fields = bool(input("Enter whether to return all fields in the document : "))
    # fields = list(map(str, input("Enter the fields in DielectricDoc to return data for : ").split()))

    dielectric = mpr.dielectric.search(material_ids=material_ids, e_total=e_total, e_ionic=e_ionic, e_electronic=e_electronic, n=n, num_chunks=num_chunks, chunk_size=chunk_size)

    for i in dielectric:
        print("Formula : {}".format(i.formula_pretty))
        print("Total Dielectric Tensor : {}".format(i.total))
        print("Ionic Dielectric Tensor : {}".format(i.ionic))
        print("Electronic Dielectric Tensor : {}".format(i.electronic))
        print("Total Electrical permittivity : {}".format(i.e_total))
        print("Ionic Electrical permittivity : {}".format(i.e_ionic))
        print("Electronic Electrical permittivity : {}".format(i.e_electronic))
        print("Refractive Index : {}".format(i.n))
        print("~"*100)
        
