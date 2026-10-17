from mp_api.client import MPRester

with MPRester("YOUR_MP_API_KEY") as mpr:
    """
    chemsys (str, List[str]): A chemical system or list of chemical systems
        (e.g., Li-Fe-O, Si-*, [Si-O, Li-Fe-P]).
    energy_above_hull (Tuple[float,float]): Minimum and maximum energy above the hull in eV/atom to consider.
    equilibrium_reaction_energy (Tuple[float,float]): Minimum and maximum equilibrium reaction energy
        in eV/atom to consider.
    formation_energy (Tuple[float,float]): Minimum and maximum formation energy in eV/atom to consider.
    formula (str, List[str]): A formula including anonymized formula
        or wild cards (e.g., Fe2O3, ABO3, Si*). A list of chemical formulas can also be passed
        (e.g., [Fe2O3, ABO3]).
    is_stable (bool): Whether the material is stable.
    material_ids (List[str]): List of Materials Project IDs to return data for.
    num_elements (Tuple[int,int]): Minimum and maximum number of elements in the material to consider.
    total_energy (Tuple[float,float]): Minimum and maximum corrected total energy in eV/atom to consider.
    uncorrected_energy (Tuple[float,float]): Minimum and maximum uncorrected total
        energy in eV/atom to consider.
    sort_fields (List[str]): Fields used to sort results. Prefix with '-' to sort in descending order.
    num_chunks (int): Maximum number of chunks of data to yield. None will yield all possible.
    chunk_size (int): Number of data entries per chunk.
    all_fields (bool): Whether to return all fields in the document. Defaults to True.
    fields (List[str]): List of fields in ThermoDoc to return data for.
        Default is material_id and last_updated if all_fields is False.


    """
    chemsys = str(input("Enter the chemical system (eg: Li-Fe-O, Si-*, [Si-O, Li-Fe-P]): "))
    energy_above_hull = (float(input("Enter the minimum energy above the hull in eV/atom to consider: ") or float('-inf')), float(input("Enter the maximum energy above the hull in eV/atom to consider: ") or float('inf')))
    equilibrium_reaction_energy = (float(input("Enter the minimum equilibrium reaction energy in eV/atom to consider: ") or float('-inf')), float(input("Enter the maximum equilibrium reaction energy in eV/atom to consider: ") or float('inf')))
    formation_energy = (float(input("Enter the minimum formation energy in eV/atom to consider: ") or float('-inf')), float(input("Enter the maximum formation energy in eV/atom to consider: ") or float('inf')))
    formula = str(input("Enter the formula including anonymized formula or wild cards (e.g., Fe2O3, ABO3, Si*): "))
    is_stable = bool(input("Enter whether the material is stable: "))
    # material_ids = list(input("Enter the list of Materials Project IDs to return data for: "))
    num_elements = (int(input("Enter the minimum number of elements in the material to consider: ") or 0), int(input("Enter the maximum number of elements in the material to consider: ") or 10000000))
    total_energy = (float(input("Enter the minimum corrected total energy in eV/atom to consider: ") or float('inf')), float(input("Enter the maximum corrected total energy in eV/atom to consider: ") or float('inf')))
    uncorrected_energy = (float(input("Enter the minimum uncorrected total energy in eV/atom to consider: ") or float('-inf')), float(input("Enter the maximum uncorrected total energy in eV/atom to consider: ") or float('inf')))
    # sort_fields = list(input("Enter the fields used to sort results. Prefix with '-' to sort in descending order: "))
    num_chunks = int(input("Enter the maximum number of chunks of data to yield. None will yield all possible: ") or 1000)
    chunk_size = int(input("Enter the number of data entries per chunk: ") or 100)
    # all_fields = bool(input("Enter whether to return all fields in the document. Defaults to True: "))
    # fields = list(input("Enter the list of fields in ThermoDoc to return data for. Default is material_id and last_updated if all_fields is False: "))

    docs = mpr.thermo.search(chemsys=chemsys, energy_above_hull=energy_above_hull, equilibrium_reaction_energy=equilibrium_reaction_energy, formation_energy=formation_energy, formula=formula, is_stable=is_stable, num_elements=num_elements, total_energy=total_energy, uncorrected_energy=uncorrected_energy, num_chunks=num_chunks, chunk_size=chunk_size)


    # ['surfaces', 'weighted_surface_energy_EV_PER_ANG2', 'weighted_surface_energy', 'surface_anisotropy', 'pretty_formula', 'shape_factor', 'weighted_work_function', 'has_reconstructed', 'structure']

    for doc in docs:
        print(doc)
