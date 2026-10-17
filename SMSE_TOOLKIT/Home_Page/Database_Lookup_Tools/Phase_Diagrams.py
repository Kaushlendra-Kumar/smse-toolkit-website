from mp_api.client import MPRester

with MPRester("YOUR_MP_API_KEY") as mpr:
    """
    Get a pre-computed phase diagram for a given chemsys.

        Arguments:
            material_id (str): Materials project ID
        Returns:
            phase_diagram (PhaseDiagram): Pymatgen phase diagram object.

    """
    # a = list(map(str, input("Enter the list of elements to search for: ").split()))
    # docs = mpr.summary.search(elements=a, fields=["material_id", "chemsys", "formula_pretty"])
    # compounds = []
    # for doc in docs:
    #     compounds.append([doc.material_id, doc.formula_pretty, doc.chemsys])

    # for i in compounds:
    #     try:
    #         ans = mpr.thermo.get_phase_diagram_from_chemsys(chemsys=i[2])
    #         print(i[1])
    #         print(ans)
    #         print("~" * 100)
    #     except:
    #         print("No phase diagram for {}".format(i[1]))
    ans = mpr.thermo.get_phase_diagram_from_chemsys(chemsys="Li-Fe-O")
    print(ans)

    # fields = list(input("Enter the list of fields in ThermoDoc to return data for. Default is material_id and last_updated if all_fields is False: "))

    # docs = mpr.thermo.search(chemsys=chemsys, energy_above_hull=energy_above_hull, equilibrium_reaction_energy=equilibrium_reaction_energy, formation_energy=formation_energy, formula=formula, is_stable=is_stable, num_elements=num_elements, total_energy=total_energy, uncorrected_energy=uncorrected_energy, num_chunks=num_chunks, chunk_size=chunk_size, all_fields=all_fields)


    # ['surfaces', 'weighted_surface_energy_EV_PER_ANG2', 'weighted_surface_energy', 'surface_anisotropy', 'pretty_formula', 'shape_factor', 'weighted_work_function', 'has_reconstructed', 'structure']

    # for doc in docs:
    #     print(doc)
