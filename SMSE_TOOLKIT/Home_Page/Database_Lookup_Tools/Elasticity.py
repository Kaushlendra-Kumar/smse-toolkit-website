from mp_api.client import MPRester

with MPRester("YOUR_MP_API_KEY") as mpr:
    """
    elastic_anisotropy (Tuple[float,float]): Minimum and maximum value to consider for
                the elastic anisotropy.
    g_voigt (Tuple[float,float]): Minimum and maximum value in GPa to consider for
        the Voigt average of the shear modulus.
    g_reuss (Tuple[float,float]): Minimum and maximum value in GPa to consider for
        the Reuss average of the shear modulus.
    g_vrh (Tuple[float,float]): Minimum and maximum value in GPa to consider for
        the Voigt-Reuss-Hill average of the shear modulus.
    k_voigt (Tuple[float,float]): Minimum and maximum value in GPa to consider for
        the Voigt average of the bulk modulus.
    k_reuss (Tuple[float,float]): Minimum and maximum value in GPa to consider for
        the Reuss average of the bulk modulus.
    k_vrh (Tuple[float,float]): Minimum and maximum value in GPa to consider for
        the Voigt-Reuss-Hill average of the bulk modulus.
    poisson_ratio (Tuple[float,float]): Minimum and maximum value to consider for
        Poisson's ratio.
    sort_fields (List[str]): Fields used to sort results. Prefix with '-' to sort in descending order.
    num_chunks (int): Maximum number of chunks of data to yield. None will yield all possible.
    chunk_size (int): Number of data entries per chunk.
    all_fields (bool): Whether to return all fields in the document. Defaults to True.
    fields (List[str]): List of fields in ElasticityDoc to return data for.
        Default is material_id and prett-formula if all_fields is False.

    """
    elastic_anisotropy = tuple(map(float, input("Minimum and maximum value to consider for the elastic anisotropy :").split()))
    g_voigt = tuple(map(float, input("Minimum and maximum value in GPa to consider for the Voigt average of the shear modulus :").split()))
    g_reuss = tuple(map(float, input("Minimum and maximum value in GPa to consider for the Reuss average of the shear modulus :").split()))
    g_vrh = tuple(map(float, input("Minimum and maximum value in GPa to consider for the Voigt-Reuss-Hill average of the shear modulus :").split()))
    k_voigt = tuple(map(float, input("Minimum and maximum value in GPa to consider for the Voigt average of the bulk modulus :").split()))
    k_reuss = tuple(map(float, input("Minimum and maximum value in GPa to consider for the Reuss average of the bulk modulus :").split()))
    k_vrh = tuple(map(float, input("Minimum and maximum value in GPa to consider for the Voigt-Reuss-Hill average of the bulk modulus :").split()))
    poisson_ratio = tuple(map(float, input("Minimum and maximum value to consider for Poisson's ratio :").split()))
    # sort_fields = list(map(str, input("Fields used to sort results. Prefix with '-' to sort in descending order :").split()))
    num_chunks = int(input("Maximum number of chunks of data to yield. 'None' will yield all possible :") or 1000)
    chunk_size = int(input("Number of data entries per chunk :") or 100)
    # all_fields = bool(input("Whether to return all fields in the document. Defaults to True :"))

    docs = mpr.elasticity.search(elastic_anisotropy=elastic_anisotropy, g_voigt=g_voigt, g_reuss=g_reuss, g_vrh=g_vrh, k_voigt=k_voigt, k_reuss=k_reuss, k_vrh=k_vrh, poisson_ratio=poisson_ratio, num_chunks=num_chunks, chunk_size=chunk_size, fields=["pretty_formula", "chemsys", "elasticity"])


    # ['surfaces', 'weighted_surface_energy_EV_PER_ANG2', 'weighted_surface_energy', 'surface_anisotropy', 'pretty_formula', 'shape_factor', 'weighted_work_function', 'has_reconstructed', 'structure']

    for doc in docs:
        print("pretty_formula : ", doc.pretty_formula)
        print("Chemsys : ", doc.chemsys)
        print("Elasticity : ", doc.elasticity)
        print("~"*100)
