#!/usr/bin/env python
"""
Yahoo! Groups scraper and static backup site generator.

Usage:
  yahoo-groups-backup.py [-h|--help] [--config=<file>]
                         [--mongo-host=<host>] [--mongo-port=<port>]
                         <command> [<args>...]

Commands:
  scrape_messages     Scrape all group messages that are not scraped yet and
                      insert them into the mongo database
  scrape_files        Scrape the group files and insert them into the mongo
                      database
  dump_site           Dump the entire backup as a static website at the given
                      root directory
  show_redaction      Show what the effects of a redaction would be

Options:
  -h --help                      Show this screen
  -c --config=<config_file>      Use config file, if it exists. Command-line
                                 settings override the config file settings.
                                 "--mongo-host=foo" converts to
                                 "mongo-host: foo" in the config
                                 file. [default: settings.yaml]
  --mongo-host=<hostname>        Host for mongo database [default: localhost]
  --mongo-port=<port>            Port for mongo database [default: 27017]
"""
import importlib
import os
import sys

from docopt import docopt
import schema
import yaml

from yahoo_groups_backup.logging import eprint


args_schema = schema.Schema({
    '--mongo-port': schema.And(schema.Use(int), lambda n: 1 <= n <= 65535, error='Invalid mongo port'),
    # '--delay': schema.And(schema.Use(float), lambda n: n > 0, error='Invalid delay, must be number > 0'),
    object: object,
})


def merge_arguments(default_args, cfg_args, cmd_args):
    """Given the default arguments, the arguments from the config file, and the command-line arguments,
    merge the arguments in order of increasing precedence (default, config, cmd)

    NOTE: The way it is determined whether a command-line argument was passed was by checking that
    its value is equal to the default argument. As such this will fail if a command-line argument
    is explicitly passed that is the same as the default argument - the config file will take
    precedence in this case.
    """
    result = {**default_args, **cfg_args}

    for key, val in cmd_args.items():
        if val != default_args.get(key):
            result[key] = val
        elif key in cfg_args:
            eprint("Using '%s' from config file" % (key,))

    return result


def get_default_args(docstr):
    """Return a dict of the default args from a docstring."""
    from docopt import parse_defaults

    opts = parse_defaults(docstr)
    return {opt.long: opt.value for opt in opts}


def invoke_subcommand(name, cmd_argv, main_args, cfg_args):
    """Invoke the subcommand with the given name. The arguments passed in are
    the main arguments, updated with the merged config/default arguments of the command arguments.
    :param name The subcommand name
    :param cmd_argv The command argv (i.e. everything including and after command name in the argv)
    :param main_args The fully merged arguments gotten from the main script
    :param cfg_args The arguments gotten from a config file
    """
    try:
        module = importlib.import_module('yahoo_groups_backup.subcommands.%s' % (name,))
    except ImportError:
        sys.exit("Unknown command: %s" % name)

    if not module.__doc__:
        sys.exit("Command %s is missing a usage docstring" % name)

    cmd_only_args = merge_arguments(
        get_default_args(module.__doc__),
        cfg_args,
        docopt(module.__doc__, argv=cmd_argv))

    if hasattr(module, 'args_schema'):
        try:
            cmd_only_args = module.args_schema.validate(cmd_only_args)
        except schema.SchemaError as e:
            sys.exit(e.code)

    args = {**main_args, **cmd_only_args}
    return module.command(args)


def main():
    args = docopt(__doc__, version='Yahoo! Groups Backup-er 0.1',
                  options_first=True)

    cfg_args = {}
    if args['--config'] != 'settings.yaml' and not os.path.exists(args['--config']):
        sys.exit("Specified config file '%s' does not exist." % args['--config'])
    if os.path.exists(args['--config']):
        cfg_args = {('--%s' % key): val for key, val in yaml.load(open(args['--config'])).items()}

    arguments = merge_arguments(get_default_args(__doc__), cfg_args, args)
    try:
        arguments = args_schema.validate(arguments)
    except schema.SchemaError as e:
        sys.exit(e.code)

    cmd_name = arguments.pop('<command>')
    cmd_argv = [cmd_name] + arguments.pop('<args>')
    return invoke_subcommand(cmd_name, cmd_argv,
                             arguments, cfg_args)


if __name__ == "__main__":
    main()
