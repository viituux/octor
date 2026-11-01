#!/usr/bin/env python
# Entrada de comandos Django; configura o módulo de settings antes de delegar argumentos à ferramenta administrativa.
"""Django's command-line utility for administrative tasks."""
# Dependência: leitura de variáveis e configuração do processo.
import os
# Dependência: argumentos e integração com o processo Python.
import sys


# Inicializa o ambiente de comandos Django e encaminha os argumentos da linha de comando.
# Retorno: None; o efeito está nas operações do corpo.
# Falhas explícitas no fluxo: ImportError. Consulte os blocos try/except para as conversões locais.
def main():
    """Run administrative tasks."""
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    try:
        # Dependência: exceções, validações, cache ou utilitários de comandos do Django.
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
