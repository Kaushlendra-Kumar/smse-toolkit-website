from mp_api.client import MPRester

with MPRester("YOUR_MP_API_KEY") as mpr:
    """
    has_reconstructed (bool): Whether the entry has any reconstructed surfaces.
            shape_factor (Tuple[float,float]): Minimum and maximum shape factor values to consider.
            surface_energy_anisotropy (Tuple[float,float]): Minimum and maximum surface energy anisotropy values to
                consider.
            weighted_surface_energy (Tuple[float,float]): Minimum and maximum weighted surface energy in J/m² to
                consider.
            weighted_work_function (Tuple[float,float]): Minimum and maximum weighted work function in eV to consider.
            sort_fields (List[str]): Fields used to sort results. Prefix with '-' to sort in descending order.
            num_chunks (int): Maximum number of chunks of data to yield. None will yield all possible.
            chunk_size (int): Number of data entries per chunk.
            all_fields (bool): Whether to return all fields in the document. Defaults to True.
            fields (List[str]): List of fields in SurfacePropDoc to return data for.
                Default is material_id only if all_fields is False.
    """
    has_reconstructed = bool(input("--> Whether the entry has any reconstructed surfaces? :"))
    shape_factor = tuple(input("--> Minimum and maximum shape factor values to consider? :").split())
    surface_energy_anisotropy = tuple(input("--> Minimum and maximum surface energy anisotropy values to consider? :").split())
    weighted_surface_energy = tuple(input("--> Minimum and maximum weighted surface energy in J/m² to consider? :").split())
    weighted_work_function = tuple(input("--> Minimum and maximum weighted work function in eV to consider? :").split())
    # sort_fields = list(input("--> Fields used to sort results. Prefix with '-' to sort in descending order? :").split())
    num_chunks = int(input("--> Maximum number of chunks of data to yield. None will yield all possible? :") or 1000)
    chunk_size = int(input("--> Number of data entries per chunk? :") or 100)
    # all_fields = bool(input("--> Whether to return all fields in the document. Defaults to True? :"))
    docs = mpr.surface_properties.search(has_reconstructed=has_reconstructed, shape_factor=shape_factor, surface_energy_anisotropy=surface_energy_anisotropy, weighted_surface_energy=weighted_surface_energy, weighted_work_function=weighted_work_function, num_chunks=num_chunks, chunk_size=chunk_size, fields=["pretty_formula", "weighted_surface_energy", "weighted_work_function", "surface_anisotropy", "shape_factor", "has_reconstructed", "structure"])

    # ['surfaces', 'weighted_surface_energy_EV_PER_ANG2', 'weighted_surface_energy', 'surface_anisotropy', 'pretty_formula', 'shape_factor', 'weighted_work_function', 'has_reconstructed', 'structure']

    for doc in docs:
        print("Formula: ", doc.pretty_formula)
        print("Weighted Surface Energy: ", doc.weighted_surface_energy)
        print("Weighted Work Function: ", doc.weighted_work_function)
        print("Surface Anisotropy: ", doc.surface_anisotropy)
        print("Shape Factor: ", doc.shape_factor)
        print("Has Reconstructed: ", doc.has_reconstructed)
        print("Structure: ", doc.structure)
        print("_"*80)   