import XCTest

final class HostTests: XCTestCase {
    func testConnectAndReceiveLyricsOnTablet() {
        let app = XCUIApplication(); app.launch()
        let address = app.textFields["server-address"]
        XCTAssertTrue(address.waitForExistence(timeout: 10))
        address.tap(); address.typeText("http://127.0.0.1:4186")
        app.buttons["Ligar ao StageSet"].tap()
        let page = app.webViews.firstMatch
        XCTAssertTrue(page.waitForExistence(timeout: 15))
        let name = page.textFields["Nome deste dispositivo"]
        XCTAssertTrue(name.waitForExistence(timeout: 15))
        name.tap(); name.typeText("iPad test\n")
        let code = page.textFields["Código apresentado no StageSet"]
        XCTAssertTrue(code.waitForExistence(timeout: 10))
        code.typeText("stageset-test\n")
        XCTAssertTrue(page.staticTexts["StageSet mobile test"].waitForExistence(timeout: 15))
        app.buttons["Mudar de servidor"].tap()
        XCTAssertTrue(address.waitForExistence(timeout: 5))
    }
}
