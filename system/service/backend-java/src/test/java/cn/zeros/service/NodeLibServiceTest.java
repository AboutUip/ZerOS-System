package cn.zeros.service;

import cn.zeros.controller.NodeLibExecController;
import cn.zeros.exception.AuthenticationException;
import cn.zeros.security.UserContext;
import cn.zeros.security.UserContextHolder;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.time.Duration;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Queue;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class NodeLibServiceTest {

    @AfterEach
    void tearDown() {
        UserContextHolder.clear();
    }

    @Test
    void nodeControllerRequiresSystemToken() {
        NodeLibExecController controller = new NodeLibExecController(new FakeNodeLibService());

        assertThatThrownBy(() -> controller.execute(Map.of("scriptId", "check")))
                .isInstanceOf(AuthenticationException.class)
                .hasMessageContaining("SystemToken");
    }

    @Test
    void executeScriptRejectsNonWhitelistedScriptIdBeforeRunningCommand() {
        FakeNodeLibService service = new FakeNodeLibService();

        assertThatThrownBy(() -> service.executeScript("evil"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("scriptId");
        assertThat(service.commands).isEmpty();
    }

    @Test
    void executeCheckUsesMockedNodeVersionCommand() throws Exception {
        FakeNodeLibService service = new FakeNodeLibService();
        service.results.add(new NodeLibService.CommandResult(true, "v20.11.0\n", "", 0));

        Map<String, Object> data = service.executeScript("check");

        assertThat(data).containsEntry("nodeAvailable", true)
                .containsEntry("version", "v20.11.0");
        assertThat(service.commands).hasSize(1);
        assertThat(service.commands.get(0)).contains("--version");
    }

    @Test
    void initializePackagesFiltersWhitelistAndUsesMockedCommands() throws Exception {
        FakeNodeLibService service = new FakeNodeLibService();
        service.results.add(new NodeLibService.CommandResult(false, "", "", 1));
        service.results.add(new NodeLibService.CommandResult(true, "installed", "", 0));

        Map<String, Object> data = service.initializePackages(List.of("systeminformation", "not-allowed"));

        assertThat(data).containsEntry("alreadyInstalled", List.of())
                .containsEntry("installed", List.of("systeminformation"))
                .containsEntry("failed", List.of());
        assertThat(service.commands).hasSize(2);
        assertThat(service.commands.toString()).contains("systeminformation")
                .doesNotContain("not-allowed");
    }

    private static class FakeNodeLibService extends NodeLibService {
        private final List<List<String>> commands = new ArrayList<>();
        private final Queue<CommandResult> results = new ArrayDeque<>();

        @Override
        protected CommandResult runCommand(Duration timeout, List<String> command) throws IOException, InterruptedException {
            commands.add(command);
            if (results.isEmpty()) {
                return new CommandResult(true, "", "", 0);
            }
            return results.remove();
        }
    }
}
