#!/bin/bash

echo "¿Cuál es el mensaje para este respaldo?"
read mensaje

echo "Agregando cambios..."
git add .

echo "Creando commit..."
git commit -m "$mensaje"

echo "Subiendo al repositorio de GitHub..."
git push origin master

echo "✅ Respaldo completo."
