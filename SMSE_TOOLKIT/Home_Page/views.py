from django.shortcuts import render
from django.http import HttpResponse

# Create your views here.
def index(request):
    return render(request, 'Home_Page/index.html')
    return HttpResponse("Hello, world. You're at the Homepage index.")

def Citation_Generator(request):
    return render(request, 'Citation_Generator/index.html')
    return HttpResponse("Hello, world. You're at the Citation_Generator index.")

def Database_Lookup(request):
    return render(request, 'Database_Lookup/index.html')
    return HttpResponse("Hello, world. You're at the Database_Lookup index.")

def Database_Lookup_Semiconductor(request):
    return render(request, 'Database_Lookup/semiconductor.html')
    return HttpResponse("Hello, world. You're at the Database_Lookup_Semiconductor index.")

def Database_Lookup_Semiconductor_Result(request):
    return render(request, 'Database_Lookup/semiconductor_result.html')
    return HttpResponse("Hello, world. You're at the Database_Lookup_Semiconductor_Result index.")

def Atomic_Information(request):
    return render(request, 'Database_Lookup/periodic_table.html')
    return HttpResponse("Hello, world. You're at the Database_Lookup index.")

def Micrograph_Recognition(request):
    return render(request, 'Micrograph_Recognition/index.html')
    return HttpResponse("Hello, world. You're at the Micrograph_Recognition index.")

def Property_Prediction(request):
    return render(request, 'Property_Prediction/index.html')
    return HttpResponse("Hello, world. You're at the Property_Prediction index.")

def Steel_Composition(request):
    return render(request, 'Steel_Composition/index.html')
    return HttpResponse("Hello, world. You're at the Steel_Composition index.")

