const inspect = require("util").inspect;
const format = require("util").format;
const create = require("lodash.create");

const badResponseFormat = "Command handler for %s returned with invalid value: %s";

function Command (privmsg, command_text) {
    const args = command_text.split(/ +/);
    const commandName = args.shift().toLowerCase();

    return create(privmsg, {
        args: args,
        command: commandName
    });
}

function startsWith(string, prefix) {
    return string.slice(0, prefix.length) === prefix;
}

module.exports = {
    init: function (client, deps) {
        var trigger = client.config("command-trigger");
        trigger = typeof trigger === "string" ? trigger : "!";

        const ignoreList = (client.config("command-ignore-list") || []).map(λ[#.toLowerCase()]);

        // invariant: keys must be normalized to lower case.
        const registry = {};

        // Returns false if privmsg is *not* a command query.
        // Otherwise, returns the string that is the command query.
        // e.g.  "commandname arg1 arg2 ..."
        function tryParseCommandString (privmsg) {
            function removeTrigger (string) {
                return string.slice(trigger.length);
            }

            if (startsWith(privmsg.message, trigger)) {
                return removeTrigger(privmsg.message);
            }

            if (privmsg.isQuery) {
                return privmsg.message;
            }

            if (startsWith(privmsg.message.toLowerCase(), client.nickname().toLowerCase())) {
                // Trimming in case of multiple spaces. e.g. (raw message)
                // nick!user@host PRIVMSG #chan botname:   do something
                const message = privmsg.message.slice(privmsg.message.indexOf(" ") + 1).trim();
                return startsWith(message, trigger) ? removeTrigger(message) : message;
            }

            return false;
        };

        return {
            handlers: {
                "privmsg": function (privmsg) {
                    const maybeCommand = tryParseCommandString(privmsg);

                    if (!maybeCommand) {
                        return;
                    }

                    const command = Command(privmsg, maybeCommand);
                    client.note("PluginCommand", "Command detected:", command.command);

                    if (registry[command.command]) {
                        client.note("PluginCommand", "Command handler found.");

                        if (ignoreList.indexOf(command.command) !== -1) {
                            client.note("PluginCommand", "But command is ignored.");
                            return;
                        }

                        return registry[command.command](command);
                    } else {
                        client.note("PluginCommand", "Command handler not found.")
                    }
                }
            },

            subscribe: {
                prefix: trigger,
                emitter: {
                    on: function (commandName, handler) {
                        commandName = commandName.toLowerCase();

                        if (commandName in registry) {
                            throw new Error(format("Command '%s' already has a handler.", commandName));
                        }

                        registry[commandName] = handler;
                    },

                    off: function () {
                        throw new Error("Cannot remove command handlers once attached.");
                    },

                    once: function () {
                        throw new Error("Cannot only listen to a command once.");
                    }
                }
            },

            exports: {
                isCommand: function (message) {
                    return tryParseCommandString(message) !== false;
                }
            }
        };
    },

    requires: ["subscriber", "messages", "self"]
};