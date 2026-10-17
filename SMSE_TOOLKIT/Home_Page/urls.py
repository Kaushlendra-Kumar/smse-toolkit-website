from django.urls import path, include
from . import views

urlpatterns = [
    path('', views.index, name='index'),
    path('Citation_Generator/', views.Citation_Generator, name='Citation_Generator'),
    path('Database_Lookup/', views.Database_Lookup, name='Database_Lookup'),
    path('Atomic_Information/', views.Atomic_Information, name='Atomic_Information'),
    path('Micrograph_Recognition/', views.Micrograph_Recognition, name='Micrograph_Recognition'),
    path('Property_Prediction/', views.Property_Prediction, name='Property_Prediction'),
    path('Steel_Composition/', views.Steel_Composition, name='Steel_Composition'),
    path('Database_Lookup/Semiconductor/', views.Database_Lookup_Semiconductor, name='Database_Lookup_Semiconductor'),
    path('Database_Lookup/Semiconductor/Result/', views.Database_Lookup_Semiconductor_Result, name='Database_Lookup_Semiconductor_Result'),
]